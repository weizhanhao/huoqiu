import { randomBytes, randomUUID } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  AUTH_PROVIDER_PORT,
  type AuthProviderPort,
  type AuthTransport,
  type IssuedProviderCredential,
  type ProviderRequestCredential,
} from "./auth-provider.port.js";

export const IDENTITY_STORE_PORT = Symbol("IDENTITY_STORE_PORT");

export type ActorRole = "admin" | "creator" | "operator" | "reviewer" | "user";

export type IdentityActor = Readonly<{
  actorId: string;
  consentVersion: string;
  displayName: string;
  email: string;
  providerUserId: string;
  roles: readonly ActorRole[];
  status: "active" | "suspended";
}>;

export type IdentitySession = Readonly<{
  actor: IdentityActor;
  credential: ProviderRequestCredential;
  expiresAt: Date;
  providerSessionId: string;
  transport: AuthTransport;
}>;

export type IssuedIdentitySession = IdentitySession &
  Readonly<{ issuedCredential: IssuedProviderCredential }>;

type ProvisionedIdentity = Readonly<{
  providerSessionId: string;
  providerUserId: string;
}>;

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
  findActorByProviderUserId(
    providerUserId: string,
  ): Promise<IdentityActor | null>;
  suspendActor(actorId: string): Promise<IdentityActor>;
}

type InvitationState = "available" | "consumed";

export class InMemoryIdentityStore implements IdentityStorePort {
  private readonly actorsById = new Map<string, IdentityActor>();
  private readonly actorsByProviderUserId = new Map<string, IdentityActor>();
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
        providerUserId: provisioned.providerUserId,
        roles: ["user"],
        status: "active",
      };
      this.invitations.set(input.inviteCode, "consumed");
      this.actorsById.set(actor.actorId, actor);
      this.actorsByProviderUserId.set(actor.providerUserId, actor);
      return { actor, provisioned };
    });
  }

  async findActorById(actorId: string): Promise<IdentityActor | null> {
    return this.actorsById.get(actorId) ?? null;
  }

  async findActorByProviderUserId(
    providerUserId: string,
  ): Promise<IdentityActor | null> {
    return this.actorsByProviderUserId.get(providerUserId) ?? null;
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
      this.actorsByProviderUserId.set(actor.providerUserId, suspended);
      return suspended;
    });
  }

  invitationState(code: string): InvitationState | "missing" {
    return this.invitations.get(code) ?? "missing";
  }

  actorCount(): number {
    return this.actorsById.size;
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

const registerSchema = z
  .object({
    display_name: z.string().min(1).max(80),
    email: z.string().email(),
    idempotencyKey: z.string().min(8).max(128),
    invite_code: z.string().min(8).max(256),
    password: z.string().min(12).max(256),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email(),
    idempotencyKey: z.string().min(8).max(128),
    password: z.string().min(1).max(256),
    transport: z.enum(["cookie", "bearer"]),
  })
  .strict();

const logoutSchema = z
  .object({
    device_binding_id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
      .optional(),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const identityHttpException = (
  status: number,
  code:
    | "AUTH_REQUIRED"
    | "CONFLICT"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "VALIDATION_FAILED",
  message: string,
): HttpException => new HttpException({ code, details: {}, message }, status);

const validationFailure = (): HttpException =>
  identityHttpException(
    HttpStatus.BAD_REQUEST,
    "VALIDATION_FAILED",
    "Request validation failed",
  );

export class SuspendedActorError extends Error {
  override readonly name = "SuspendedActorError";
}

@Injectable()
export class AuthService {
  private readonly sseSessionState = new Map<
    string,
    Readonly<{ actorId: string }>
  >();

  constructor(
    @Inject(AUTH_PROVIDER_PORT)
    private readonly provider: AuthProviderPort,
    @Inject(IDENTITY_STORE_PORT)
    private readonly identityStore: IdentityStorePort,
  ) {}

  async register(input: unknown): Promise<IssuedIdentitySession> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) throw validationFailure();

    const result = await this.identityStore.consumeInvitationAndCreateActor(
      {
        displayName: parsed.data.display_name,
        email: parsed.data.email.toLowerCase(),
        inviteCode: parsed.data.invite_code,
      },
      async () =>
        await this.provider.register({
          displayName: parsed.data.display_name,
          email: parsed.data.email.toLowerCase(),
          password: parsed.data.password,
        }),
    );
    return this.toIssuedIdentitySession(result.actor, result.provisioned);
  }

  async login(input: unknown): Promise<IssuedIdentitySession> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw validationFailure();
    let providerSession;
    try {
      providerSession = await this.provider.login({
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
        transport: parsed.data.transport,
      });
    } catch {
      throw identityHttpException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_REQUIRED",
        "Authentication failed",
      );
    }

    const actor = await this.identityStore.findActorByProviderUserId(
      providerSession.providerUserId,
    );
    if (actor === null) {
      await this.provider.logout(providerSession.credential);
      throw identityHttpException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_REQUIRED",
        "Authentication failed",
      );
    }
    if (actor.status === "suspended") {
      await this.provider.revokeActorSessions(actor.providerUserId);
      throw identityHttpException(
        HttpStatus.FORBIDDEN,
        "FORBIDDEN",
        "Actor is suspended",
      );
    }
    return this.toIssuedIdentitySession(actor, providerSession);
  }

  async resolveSession(
    credential: ProviderRequestCredential,
  ): Promise<IdentitySession | null> {
    const providerSession = await this.provider.resolveSession(credential);
    if (providerSession === null) return null;
    const actor = await this.identityStore.findActorByProviderUserId(
      providerSession.providerUserId,
    );
    if (actor === null) return null;
    if (actor.status === "suspended") {
      await this.provider.revokeActorSessions(actor.providerUserId);
      throw new SuspendedActorError();
    }
    return {
      actor,
      credential,
      expiresAt: providerSession.expiresAt,
      providerSessionId: providerSession.providerSessionId,
      transport: credential.transport,
    };
  }

  async logout(session: IdentitySession): Promise<void> {
    await this.provider.logout(session.credential);
  }

  validateLogout(input: unknown): void {
    if (!logoutSchema.safeParse(input).success) throw validationFailure();
  }

  async suspendActor(actorId: string): Promise<void> {
    const actor = await this.identityStore.suspendActor(actorId);
    for (const [token, state] of this.sseSessionState) {
      if (state.actorId === actorId) this.sseSessionState.delete(token);
    }
    await this.provider.revokeActorSessions(actor.providerUserId);
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

  private toIssuedIdentitySession(
    actor: IdentityActor,
    providerSession: Readonly<{
      credential: ProviderRequestCredential;
      expiresAt: Date;
      issuedCredential: IssuedProviderCredential;
      providerSessionId: string;
    }>,
  ): IssuedIdentitySession {
    return {
      actor,
      credential: providerSession.credential,
      expiresAt: providerSession.expiresAt,
      issuedCredential: providerSession.issuedCredential,
      providerSessionId: providerSession.providerSessionId,
      transport: providerSession.credential.transport,
    };
  }
}
