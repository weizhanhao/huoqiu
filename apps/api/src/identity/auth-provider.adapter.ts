import { Buffer } from "node:buffer";
import { DatabaseSync } from "node:sqlite";

import type { OnModuleDestroy } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer } from "better-auth/plugins/bearer";

import type {
  AuthProviderPort,
  AuthTransport,
  IssuedProviderCredential,
  IssuedProviderSession,
  ProviderRequestCredential,
  ProviderSession,
} from "./auth-provider.port.js";

const COOKIE_NAME = "__Secure-huoqiu.session_token";
const DEFAULT_LOCAL_BASE_URL = "https://auth.huoqiu.local";

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
  durability: "process-local";
  provider: "better-auth";
}>;

// Deliberately use Better Auth's programmatic API here: importing its Nest
// module would mount provider-owned /api/auth/* routes beyond the frozen
// four-operation public identity surface.

const assertAuthSecret = (secret: string): void => {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET_INVALID");
  }
};

/**
 * Creates the selected provider against an in-process SQLite database.
 *
 * This is intentionally labelled process-local. Production persistence is a
 * composition-root responsibility and secured environments refuse to select
 * this runtime in IdentityModule.
 */
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
    durability: "process-local",
    provider: "better-auth",
  };
};

const requestHeaders = (credential: ProviderRequestCredential): Headers =>
  credential.transport === "bearer"
    ? new Headers({ authorization: credential.authorizationHeader })
    : new Headers({ cookie: credential.cookieHeader });

const requestCredentialFromIssued = (
  credential: IssuedProviderCredential,
): ProviderRequestCredential => {
  if (credential.transport === "bearer") {
    return {
      authorizationHeader: `Bearer ${credential.responseHeaderValue}`,
      transport: "bearer",
    };
  }

  const cookiePair = credential.responseHeaderValue.split(";", 1)[0];
  if (cookiePair === undefined || !cookiePair.startsWith(`${COOKIE_NAME}=`)) {
    throw new Error("BETTER_AUTH_COOKIE_INVALID");
  }
  return { cookieHeader: cookiePair, transport: "cookie" };
};

const issuedCredential = (
  headers: Headers,
  transport: AuthTransport,
): IssuedProviderCredential => {
  if (transport === "bearer") {
    const token = headers.get("set-auth-token");
    if (token === null || token.length === 0) {
      throw new Error("BETTER_AUTH_BEARER_NOT_ISSUED");
    }
    return { responseHeaderValue: token, transport };
  }

  const cookie = headers.get("set-cookie");
  if (cookie === null || !cookie.startsWith(`${COOKIE_NAME}=`)) {
    throw new Error("BETTER_AUTH_COOKIE_NOT_ISSUED");
  }
  return { responseHeaderValue: cookie, transport };
};

export class BetterAuthProviderAdapter
  implements AuthProviderPort, OnModuleDestroy
{
  constructor(private readonly runtime: BetterAuthRuntime) {}

  async register(
    input: Readonly<{
      displayName: string;
      email: string;
      password: string;
    }>,
  ): Promise<IssuedProviderSession> {
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
  ): Promise<IssuedProviderSession> {
    const result = await this.runtime.auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      returnHeaders: true,
    });
    return await this.hydrateIssuedSession(result.headers, input.transport);
  }

  async resolveSession(
    credential: ProviderRequestCredential,
  ): Promise<ProviderSession | null> {
    const resolved = await this.runtime.auth.api.getSession({
      headers: requestHeaders(credential),
    });
    if (resolved === null) return null;

    return {
      credential,
      expiresAt: new Date(resolved.session.expiresAt),
      providerSessionId: resolved.session.id,
      providerUserId: resolved.user.id,
    };
  }

  async logout(credential: ProviderRequestCredential): Promise<void> {
    await this.runtime.auth.api.signOut({
      headers: requestHeaders(credential),
    });
  }

  async revokeActorSessions(providerUserId: string): Promise<void> {
    const context = await this.runtime.auth.$context;
    await context.internalAdapter.deleteUserSessions(providerUserId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime.close();
  }

  private async hydrateIssuedSession(
    responseHeaders: Headers,
    transport: AuthTransport,
  ): Promise<IssuedProviderSession> {
    const issued = issuedCredential(responseHeaders, transport);
    const request = requestCredentialFromIssued(issued);
    const session = await this.resolveSession(request);
    if (session === null) {
      throw new Error("BETTER_AUTH_SESSION_NOT_ISSUED");
    }
    return { ...session, issuedCredential: issued };
  }
}
