import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { OnModuleDestroy } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer } from "better-auth/plugins/bearer";

import type {
  AuthCredentialCapability,
  AuthProviderPort,
  AuthSubjectSession,
  AuthTransport,
} from "./auth-provider.port.js";

const COOKIE_NAME = "__Secure-huoqiu.session_token";
const DEFAULT_LOCAL_BASE_URL = "https://auth.huoqiu.local";
const BEARER_VALUE_PATTERN = /^[A-Za-z0-9._~+/=-]+$/u;
const COOKIE_VALUE_PATTERN = /^[A-Za-z0-9._~+/%=-]+$/u;

export type ProcessLocalBetterAuthOptions = Readonly<{
  baseUrl?: string;
  secret: string;
}>;

const createSelectedBetterAuth = (
  database: DatabaseSync,
  options: ProcessLocalBetterAuthOptions,
) =>
  betterAuth({
    advanced: {
      cookiePrefix: "huoqiu",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
      useSecureCookies: true,
    },
    baseURL: options.baseUrl ?? DEFAULT_LOCAL_BASE_URL,
    database,
    emailAndPassword: { enabled: true },
    plugins: [bearer({ requireSignature: true })],
    secret: options.secret,
    trustedOrigins: [options.baseUrl ?? DEFAULT_LOCAL_BASE_URL],
  });

export type BetterAuthRuntime = Readonly<{
  auth: ReturnType<typeof createSelectedBetterAuth>;
  close(): Promise<void>;
  credentialHmacKey: Buffer;
  durability: "process-local";
}>;

const assertAuthSecret = (secret: string): void => {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET_INVALID");
  }
};

export const createProcessLocalBetterAuthRuntime = async (
  options: ProcessLocalBetterAuthOptions,
): Promise<BetterAuthRuntime> => {
  assertAuthSecret(options.secret);
  const database = new DatabaseSync(":memory:");
  const auth = createSelectedBetterAuth(database, options);

  try {
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
  } catch (error) {
    database.close();
    throw error;
  }

  let closed = false;
  return {
    auth,
    close: async () => {
      if (closed) return;
      closed = true;
      database.close();
    },
    credentialHmacKey: createHmac("sha256", options.secret)
      .update("huoqiu:identity:credential-fingerprint:v1")
      .digest(),
    durability: "process-local",
  };
};

type CredentialState = Readonly<{
  delivery?: Readonly<{ transport: AuthTransport; value: string }>;
  requestHeaders: Headers;
}>;

const credentialStates = new WeakMap<
  AuthCredentialCapability,
  CredentialState
>();

export type CredentialInspection =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{
      credential: AuthCredentialCapability;
      kind: "credential";
    }>;

const rawHeaderValues = (
  request: FastifyRequest,
  name: string,
): readonly string[] => {
  const rawHeaders = request.raw.rawHeaders;
  const values: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) {
      const value = rawHeaders[index + 1];
      if (value !== undefined) values.push(value);
    }
  }
  if (values.length > 0) return values;
  const value = request.headers[name];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
};

const hasUnsafeScalarShape = (value: string): boolean =>
  value.length === 0 || /[\r\n,]/u.test(value);

export class CredentialBoundary {
  constructor(private readonly runtime: BetterAuthRuntime) {}

  inspect(request: FastifyRequest): CredentialInspection {
    const authorizationValues = rawHeaderValues(request, "authorization");
    const cookieValues = rawHeaderValues(request, "cookie");
    if (authorizationValues.length > 1 || cookieValues.length > 1) {
      return { kind: "invalid" };
    }
    if (authorizationValues.length > 0 && cookieValues.length > 0) {
      return { kind: "invalid" };
    }

    const authorization = authorizationValues[0];
    if (authorization !== undefined) {
      if (hasUnsafeScalarShape(authorization)) return { kind: "invalid" };
      const match = /^Bearer ([^ ]+)$/iu.exec(authorization);
      const value = match?.[1];
      if (value === undefined || !BEARER_VALUE_PATTERN.test(value)) {
        return { kind: "invalid" };
      }
      return {
        credential: this.createCapability(
          new Headers({ authorization: `Bearer ${value}` }),
          "bearer",
        ),
        kind: "credential",
      };
    }

    const cookie = cookieValues[0];
    if (cookie === undefined) return { kind: "none" };
    if (hasUnsafeScalarShape(cookie)) return { kind: "invalid" };
    const selected = cookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
    if (selected.length === 0) return { kind: "none" };
    if (selected.length !== 1) return { kind: "invalid" };
    const value = selected[0]?.slice(COOKIE_NAME.length + 1);
    if (value === undefined || !COOKIE_VALUE_PATTERN.test(value)) {
      return { kind: "invalid" };
    }
    const pair = `${COOKIE_NAME}=${value}`;
    return {
      credential: this.createCapability(
        new Headers({ cookie: pair }),
        "cookie",
      ),
      kind: "credential",
    };
  }

  deliver(reply: FastifyReply, credential: AuthCredentialCapability): void {
    const delivery = this.state(credential).delivery;
    if (delivery === undefined) {
      throw new Error("AUTH_CREDENTIAL_NOT_DELIVERABLE");
    }
    if (delivery.transport === "cookie") {
      void reply.header("set-cookie", delivery.value);
      return;
    }
    void reply
      .header("set-auth-token", delivery.value)
      .header("access-control-expose-headers", "set-auth-token");
  }

  requestHeaders(credential: AuthCredentialCapability): Headers {
    return this.state(credential).requestHeaders;
  }

  fromIssued(
    headers: Headers,
    transport: AuthTransport,
  ): AuthCredentialCapability {
    if (transport === "bearer") {
      const value = headers.get("set-auth-token");
      if (value === null || !BEARER_VALUE_PATTERN.test(value)) {
        throw new Error("AUTH_CREDENTIAL_NOT_ISSUED");
      }
      return this.createCapability(
        new Headers({ authorization: `Bearer ${value}` }),
        transport,
        { transport, value },
      );
    }

    const value = headers.get("set-cookie");
    const pair = value?.split(";", 1)[0];
    if (
      value === null ||
      pair === undefined ||
      !pair.startsWith(`${COOKIE_NAME}=`)
    ) {
      throw new Error("AUTH_CREDENTIAL_NOT_ISSUED");
    }
    return this.createCapability(new Headers({ cookie: pair }), transport, {
      transport,
      value,
    });
  }

  private createCapability(
    headers: Headers,
    transport: AuthTransport,
    delivery?: Readonly<{ transport: AuthTransport; value: string }>,
  ): AuthCredentialCapability {
    const material =
      headers.get("authorization") ?? headers.get("cookie") ?? "";
    const capability = {
      fingerprint: createHmac("sha256", this.runtime.credentialHmacKey)
        .update(transport)
        .update("\0")
        .update(material)
        .digest("hex"),
      transport,
    } as AuthCredentialCapability;
    credentialStates.set(capability, {
      ...(delivery === undefined ? {} : { delivery }),
      requestHeaders: headers,
    });
    return capability;
  }

  private state(credential: AuthCredentialCapability): CredentialState {
    const state = credentialStates.get(credential);
    if (state === undefined) throw new Error("AUTH_CREDENTIAL_INVALID");
    return state;
  }
}

export class BetterAuthProviderAdapter
  implements AuthProviderPort, OnModuleDestroy
{
  private readonly boundary: CredentialBoundary;

  constructor(
    private readonly runtime: BetterAuthRuntime,
    boundary?: CredentialBoundary,
  ) {
    this.boundary = boundary ?? new CredentialBoundary(runtime);
  }

  async register(
    input: Readonly<{
      displayName: string;
      email: string;
      password: string;
    }>,
  ): Promise<AuthSubjectSession> {
    const result = await this.runtime.auth.api.signUpEmail({
      body: {
        email: input.email,
        name: input.displayName,
        password: input.password,
      },
      returnHeaders: true,
    });
    return await this.hydrateIssuedSession(result.headers, "cookie");
  }

  async login(
    input: Readonly<{
      email: string;
      password: string;
      transport: AuthTransport;
    }>,
  ): Promise<AuthSubjectSession> {
    const result = await this.runtime.auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      returnHeaders: true,
    });
    return await this.hydrateIssuedSession(result.headers, input.transport);
  }

  async resolveSession(
    credential: AuthCredentialCapability,
  ): Promise<AuthSubjectSession | null> {
    const resolved = await this.runtime.auth.api.getSession({
      headers: this.boundary.requestHeaders(credential),
    });
    if (resolved === null) return null;
    return {
      credential,
      expiresAt: new Date(resolved.session.expiresAt),
      subjectId: resolved.user.id,
    };
  }

  async logout(credential: AuthCredentialCapability): Promise<void> {
    await this.runtime.auth.api.signOut({
      headers: this.boundary.requestHeaders(credential),
    });
  }

  async revokeSubjectSessions(subjectId: string): Promise<void> {
    const context = await this.runtime.auth.$context;
    await context.internalAdapter.deleteUserSessions(subjectId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime.close();
  }

  private async hydrateIssuedSession(
    responseHeaders: Headers,
    transport: AuthTransport,
  ): Promise<AuthSubjectSession> {
    const credential = this.boundary.fromIssued(responseHeaders, transport);
    const session = await this.resolveSession(credential);
    if (session === null) throw new Error("AUTH_SESSION_NOT_ISSUED");
    return session;
  }
}
