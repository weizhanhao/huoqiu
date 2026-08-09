import { randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  IdempotentRequest,
  LoginBody,
  LogoutBody,
  RegisterBody,
} from "./auth-contract.js";
import {
  AUTH_PROVIDER_PORT,
  type AuthCredentialCapability,
  type AuthProviderPort,
  type AuthSubjectSession,
  type AuthTransport,
} from "./auth-provider.port.js";
import { IDEMPOTENCY_REGISTRY } from "./idempotency-registry.js";
import type { BoundedIdempotencyRegistry } from "./idempotency-registry.js";
import {
  identityHttpException,
  SuspendedActorError,
} from "./identity-error.js";

export {
  identityHttpException,
  SuspendedActorError,
} from "./identity-error.js";

export const IDENTITY_STORE_PORT = Symbol("IDENTITY_STORE_PORT");

export type ActorRole = "admin" | "creator" | "operator" | "reviewer" | "user";

export type IdentityActor = Readonly<{
  actorId: string;
  consentVersion: string;
  displayName: string;
  email: string;
  identitySubjectId: string;
  roles: readonly ActorRole[];
  status: "active" | "suspended";
}>;

export type IdentitySession = Readonly<{
  actor: IdentityActor;
  credential: AuthCredentialCapability;
  expiresAt: Date;
  transport: AuthTransport;
}>;

type ProvisionedIdentity = Readonly<{ subjectId: string }>;

export interface IdentityStorePort {
  consumeInvitationAndCreateActor<TProvisioned extends ProvisionedIdentity>(
    input: Readonly<{
      displayName: string;
      email: string;
      inviteCode: string;
    }>,
    provision: () => Promise<TProvisioned>,
  ): Promise<Readonly<{ actor: IdentityActor; provisioned: TProvisioned }>>;
  findActorById(actorId: string): Promise<IdentityActor | null>;
  findActorByIdentitySubjectId(
    identitySubjectId: string,
  ): Promise<IdentityActor | null>;
  isDeviceBindingRevoked(
    actorId: string,
    deviceBindingId: string,
  ): Promise<boolean>;
  recordDeviceBindingRevocation(
    actorId: string,
    deviceBindingId: string,
  ): Promise<void>;
  suspendActor(actorId: string): Promise<IdentityActor>;
}

type InvitationState = "available" | "consumed";

export class InMemoryIdentityStore implements IdentityStorePort {
  private readonly actorsById = new Map<string, IdentityActor>();
  private readonly actorsByIdentitySubjectId = new Map<string, IdentityActor>();
  private readonly deviceBindingTombstones = new Set<string>();
  private readonly invitations = new Map<string, InvitationState>();
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(invitationCodes: readonly string[]) {
    for (const code of invitationCodes) {
      if (code.length > 0) this.invitations.set(code, "available");
    }
  }

  async consumeInvitationAndCreateActor<
    TProvisioned extends ProvisionedIdentity,
  >(
    input: Readonly<{
      displayName: string;
      email: string;
      inviteCode: string;
    }>,
    provision: () => Promise<TProvisioned>,
  ): Promise<Readonly<{ actor: IdentityActor; provisioned: TProvisioned }>> {
    return await this.inTransaction(async () => {
      if (this.invitations.get(input.inviteCode) !== "available") {
        throw identityHttpException(
          HttpStatus.CONFLICT,
          "CONFLICT",
          "Invitation is unavailable",
        );
      }

      const provisioned = await provision();
      const actor: IdentityActor = {
        actorId: `usr_${randomUUID()}`,
        consentVersion: "1",
        displayName: input.displayName,
        email: input.email,
        identitySubjectId: provisioned.subjectId,
        roles: ["user"],
        status: "active",
      };
      this.invitations.set(input.inviteCode, "consumed");
      this.actorsById.set(actor.actorId, actor);
      this.actorsByIdentitySubjectId.set(actor.identitySubjectId, actor);
      return { actor, provisioned };
    });
  }

  async findActorById(actorId: string): Promise<IdentityActor | null> {
    return this.actorsById.get(actorId) ?? null;
  }

  async findActorByIdentitySubjectId(
    identitySubjectId: string,
  ): Promise<IdentityActor | null> {
    return this.actorsByIdentitySubjectId.get(identitySubjectId) ?? null;
  }

  async isDeviceBindingRevoked(
    actorId: string,
    deviceBindingId: string,
  ): Promise<boolean> {
    return this.deviceBindingTombstones.has(
      this.deviceBindingKey(actorId, deviceBindingId),
    );
  }

  async recordDeviceBindingRevocation(
    actorId: string,
    deviceBindingId: string,
  ): Promise<void> {
    await this.inTransaction(async () => {
      this.deviceBindingTombstones.add(
        this.deviceBindingKey(actorId, deviceBindingId),
      );
    });
  }

  async suspendActor(actorId: string): Promise<IdentityActor> {
    return await this.inTransaction(async () => {
      const actor = this.actorsById.get(actorId);
      if (actor === undefined) {
        throw identityHttpException(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Actor was not found",
        );
      }
      const suspended = { ...actor, status: "suspended" as const };
      this.actorsById.set(actorId, suspended);
      this.actorsByIdentitySubjectId.set(actor.identitySubjectId, suspended);
      return suspended;
    });
  }

  invitationState(code: string): InvitationState | "missing" {
    return this.invitations.get(code) ?? "missing";
  }

  actorCount(): number {
    return this.actorsById.size;
  }

  private deviceBindingKey(actorId: string, deviceBindingId: string): string {
    return `${actorId}\0${deviceBindingId}`;
  }

  private async inTransaction<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release = (): void => undefined;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

type CallerContext = Readonly<{ callerId: string }>;
type RegisterInput = IdempotentRequest<RegisterBody> & CallerContext;
type LoginInput = IdempotentRequest<LoginBody> & CallerContext;
type LogoutInput = IdempotentRequest<LogoutBody> & CallerContext;
type LogoutOutcome = Readonly<{ session: IdentitySession }>;

class IdentityProvisioningConflict extends Error {
  override readonly name = "IdentityProvisioningConflict";
}

@Injectable()
export class AuthService {
  private readonly sseSessionState = new Map<
    string,
    Readonly<{ actorId: string }>
  >();

  constructor(
    @Inject(AUTH_PROVIDER_PORT)
    private readonly identityBackend: AuthProviderPort,
    @Inject(IDENTITY_STORE_PORT)
    private readonly identityStore: IdentityStorePort,
    @Inject(IDEMPOTENCY_REGISTRY)
    private readonly idempotency: BoundedIdempotencyRegistry,
  ) {}

  async register(input: RegisterInput): Promise<IdentitySession> {
    const email = input.body.email.toLowerCase();
    return await this.idempotency.execute(
      {
        callerId: input.callerId,
        key: input.idempotencyKey,
        operation: "auth.register",
        request: { ...input.body, email },
      },
      async () => {
        try {
          const result =
            await this.identityStore.consumeInvitationAndCreateActor(
              {
                displayName: input.body.display_name,
                email,
                inviteCode: input.body.invite_code,
              },
              async () => {
                try {
                  return await this.identityBackend.register({
                    displayName: input.body.display_name,
                    email,
                    password: input.body.password,
                  });
                } catch {
                  throw new IdentityProvisioningConflict();
                }
              },
            );
          return this.toIdentitySession(result.actor, result.provisioned);
        } catch (error) {
          if (error instanceof IdentityProvisioningConflict) {
            throw identityHttpException(
              HttpStatus.CONFLICT,
              "CONFLICT",
              "Identity already exists",
            );
          }
          throw error;
        }
      },
    );
  }

  async login(input: LoginInput): Promise<IdentitySession> {
    const email = input.body.email.toLowerCase();
    return await this.idempotency.execute(
      {
        callerId: input.callerId,
        key: input.idempotencyKey,
        operation: "auth.login",
        request: { ...input.body, email },
      },
      async () => {
        let subjectSession: AuthSubjectSession;
        try {
          subjectSession = await this.identityBackend.login({
            email,
            password: input.body.password,
            transport: input.body.transport,
          });
        } catch {
          throw identityHttpException(
            HttpStatus.UNAUTHORIZED,
            "AUTH_REQUIRED",
            "Authentication failed",
          );
        }

        const actor = await this.identityStore.findActorByIdentitySubjectId(
          subjectSession.subjectId,
        );
        if (actor === null) {
          await this.identityBackend.logout(subjectSession.credential);
          throw identityHttpException(
            HttpStatus.UNAUTHORIZED,
            "AUTH_REQUIRED",
            "Authentication failed",
          );
        }
        if (actor.status === "suspended") {
          await this.identityBackend.revokeSubjectSessions(
            actor.identitySubjectId,
          );
          throw identityHttpException(
            HttpStatus.FORBIDDEN,
            "FORBIDDEN",
            "Actor is suspended",
          );
        }
        return this.toIdentitySession(actor, subjectSession);
      },
    );
  }

  async resolveSession(
    credential: AuthCredentialCapability,
  ): Promise<IdentitySession | null> {
    const subjectSession =
      await this.identityBackend.resolveSession(credential);
    if (subjectSession === null) return null;
    const actor = await this.identityStore.findActorByIdentitySubjectId(
      subjectSession.subjectId,
    );
    if (actor === null) return null;
    if (actor.status === "suspended") {
      await this.identityBackend.revokeSubjectSessions(actor.identitySubjectId);
      throw new SuspendedActorError();
    }
    return this.toIdentitySession(actor, subjectSession);
  }

  async logout(input: LogoutInput, session: IdentitySession): Promise<void> {
    await this.idempotency.execute<LogoutOutcome>(
      {
        callerId: input.callerId,
        key: input.idempotencyKey,
        operation: "auth.logout",
        request: {
          body: input.body,
          credentialFingerprint: session.credential.fingerprint,
        },
      },
      async () => {
        await this.identityBackend.logout(session.credential);
        if (input.body.device_binding_id !== undefined) {
          await this.identityStore.recordDeviceBindingRevocation(
            session.actor.actorId,
            input.body.device_binding_id,
          );
        }
        return { session };
      },
    );
  }

  async findLogoutReplay(
    input: LogoutInput,
    credential: AuthCredentialCapability,
  ): Promise<IdentitySession | null> {
    const outcome = await this.idempotency.replay<LogoutOutcome>({
      callerId: input.callerId,
      key: input.idempotencyKey,
      operation: "auth.logout",
      request: {
        body: input.body,
        credentialFingerprint: credential.fingerprint,
      },
    });
    return outcome?.session ?? null;
  }

  async isDeviceBindingRevoked(
    actorId: string,
    deviceBindingId: string,
  ): Promise<boolean> {
    return await this.identityStore.isDeviceBindingRevoked(
      actorId,
      deviceBindingId,
    );
  }

  async suspendActor(actorId: string): Promise<void> {
    const actor = await this.identityStore.suspendActor(actorId);
    for (const [token, state] of this.sseSessionState) {
      if (state.actorId === actorId) this.sseSessionState.delete(token);
    }
    await this.identityBackend.revokeSubjectSessions(actor.identitySubjectId);
  }

  async issueSseToken(actorId: string): Promise<string> {
    const actor = await this.identityStore.findActorById(actorId);
    if (actor === null) {
      throw identityHttpException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Actor was not found",
      );
    }
    this.assertActorActive(actor);
    const token = randomBytes(32).toString("base64url");
    this.sseSessionState.set(token, { actorId });
    return token;
  }

  async isSseTokenValid(token: string): Promise<boolean> {
    const state = this.sseSessionState.get(token);
    if (state === undefined) return false;
    const actor = await this.identityStore.findActorById(state.actorId);
    return actor?.status === "active";
  }

  private assertActorActive(actor: IdentityActor): void {
    if (actor.status === "suspended") throw new SuspendedActorError();
  }

  private toIdentitySession(
    actor: IdentityActor,
    subjectSession: AuthSubjectSession,
  ): IdentitySession {
    return {
      actor,
      credential: subjectSession.credential,
      expiresAt: subjectSession.expiresAt,
      transport: subjectSession.credential.transport,
    };
  }
}
