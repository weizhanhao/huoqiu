import { randomBytes } from "node:crypto";

import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import {
  AlphaAccessGuard,
  resolveZeroTrustConfiguration,
} from "./alpha-access.guard.js";
import { AuthController } from "./auth.controller.js";
import {
  BetterAuthProviderAdapter,
  createProcessLocalBetterAuthRuntime,
  type BetterAuthRuntime,
} from "./auth-provider.adapter.js";
import { AUTH_PROVIDER_PORT } from "./auth-provider.port.js";
import {
  AuthService,
  IDENTITY_STORE_PORT,
  InMemoryIdentityStore,
} from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";

const BETTER_AUTH_RUNTIME = Symbol("BETTER_AUTH_RUNTIME");

const isSecuredEnvironment = (): boolean =>
  process.env.APP_ENV === "production" || process.env.APP_ENV === "staging";

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
  controllers: [AuthController],
  exports: [AuthService],
  providers: [
    {
      provide: BETTER_AUTH_RUNTIME,
      useFactory: async (): Promise<BetterAuthRuntime> => {
        if (isSecuredEnvironment()) {
          throw new Error("AUTH_PROVIDER_PERSISTENCE_NOT_CONFIGURED");
        }
        return await createProcessLocalBetterAuthRuntime({
          secret: processLocalSecret(),
        });
      },
    },
    {
      inject: [BETTER_AUTH_RUNTIME],
      provide: AUTH_PROVIDER_PORT,
      useFactory: (runtime: BetterAuthRuntime) =>
        new BetterAuthProviderAdapter(runtime),
    },
    {
      provide: IDENTITY_STORE_PORT,
      useFactory: () => new InMemoryIdentityStore(invitationCodes()),
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
