import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule as BetterAuthNestModule } from "@thallesp/nestjs-better-auth";

import {
  AlphaAccessGuard,
  resolveZeroTrustConfiguration,
} from "./alpha-access.guard.js";
import { AuthController } from "./auth.controller.js";
import {
  BetterAuthProviderAdapter,
  createProcessLocalBetterAuthRuntime,
  CredentialBoundary,
  type BetterAuthRuntime,
} from "./auth-provider.adapter.js";
import { AUTH_PROVIDER_PORT } from "./auth-provider.port.js";
import {
  AuthService,
  IDENTITY_STORE_PORT,
  InMemoryIdentityStore,
} from "./auth.service.js";
import {
  BoundedIdempotencyRegistry,
  IDEMPOTENCY_REGISTRY,
} from "./idempotency-registry.js";
import { SessionGuard } from "./session.guard.js";

const BETTER_AUTH_RUNTIME = Symbol("BETTER_AUTH_RUNTIME");

type Environment = Readonly<Record<string, string | undefined>>;

const isSecuredEnvironment = (environment: Environment): boolean =>
  environment.APP_ENV === "production" || environment.APP_ENV === "staging";

export const assertIdentityRuntimeConfiguration = (
  environment: Environment = process.env,
): void => {
  if (isSecuredEnvironment(environment)) {
    throw new Error("AUTH_PROVIDER_PERSISTENCE_NOT_CONFIGURED");
  }
  const configured = environment.BETTER_AUTH_SECRET;
  if (configured !== undefined && Buffer.byteLength(configured, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET_INVALID");
  }
};

const processLocalSecret = (): string => {
  const configured = process.env.BETTER_AUTH_SECRET;
  if (configured !== undefined) return configured;
  return randomBytes(32).toString("base64url");
};

const invitationCodes = (): readonly string[] =>
  (process.env.ALPHA_INVITE_CODES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

@Global()
@Module({
  exports: [BETTER_AUTH_RUNTIME],
  providers: [
    {
      provide: BETTER_AUTH_RUNTIME,
      useFactory: async (): Promise<BetterAuthRuntime> => {
        assertIdentityRuntimeConfiguration(process.env);
        return await createProcessLocalBetterAuthRuntime({
          secret: processLocalSecret(),
        });
      },
    },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest modules carry runtime decorator metadata.
class BetterAuthRuntimeModule {}

const selectedBetterAuthModule = BetterAuthNestModule.forRootAsync({
  disableControllers: true,
  disableGlobalAuthGuard: true,
  imports: [BetterAuthRuntimeModule],
  inject: [BETTER_AUTH_RUNTIME],
  useFactory: (runtime: BetterAuthRuntime) => ({ auth: runtime.auth }),
});

@Global()
@Module({
  controllers: [AuthController],
  exports: [AuthService],
  imports: [BetterAuthRuntimeModule, selectedBetterAuthModule],
  providers: [
    {
      inject: [BETTER_AUTH_RUNTIME],
      provide: CredentialBoundary,
      useFactory: (runtime: BetterAuthRuntime) =>
        new CredentialBoundary(runtime),
    },
    {
      inject: [BETTER_AUTH_RUNTIME, CredentialBoundary],
      provide: BetterAuthProviderAdapter,
      useFactory: (runtime: BetterAuthRuntime, boundary: CredentialBoundary) =>
        new BetterAuthProviderAdapter(runtime, boundary),
    },
    {
      provide: AUTH_PROVIDER_PORT,
      useExisting: BetterAuthProviderAdapter,
    },
    {
      provide: IDENTITY_STORE_PORT,
      useFactory: () => new InMemoryIdentityStore(invitationCodes()),
    },
    {
      inject: [BETTER_AUTH_RUNTIME],
      provide: IDEMPOTENCY_REGISTRY,
      useFactory: (runtime: BetterAuthRuntime) =>
        new BoundedIdempotencyRegistry({
          secret: runtime.credentialHmacKey,
        }),
    },
    AuthService,
    {
      provide: AlphaAccessGuard,
      useFactory: () =>
        new AlphaAccessGuard(resolveZeroTrustConfiguration(process.env)),
    },
    SessionGuard,
    { provide: APP_GUARD, useExisting: AlphaAccessGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest modules carry runtime decorator metadata.
export class IdentityModule {}
