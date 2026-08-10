import { createHmac } from "node:crypto";

import { Controller, Get, HttpException, Module } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthCredentialCapability,
  AuthProviderPort,
} from "../../src/identity/auth-provider.port.js";
import {
  AuthService,
  InMemoryIdentityStore,
} from "../../src/identity/auth.service.js";
import { IdentityModule } from "../../src/identity/identity.module.js";
import { BoundedIdempotencyStore } from "../../src/identity/idempotency-store.js";
import { createHttpApp } from "../../src/main.js";

const edgeSecret = "alpha-edge-test-secret-with-at-least-32-characters";
const edgeIssuer = "huoqiu-test-edge";
const inviteCode = "INVITE-SUSPEND-001";
const authSecret =
  "better-auth-test-secret-with-at-least-thirty-two-characters";
const controllerAction = vi.fn(() => ({ reached: true as const }));

@Controller("protected-action")
class ProtectedActionController {
  @Get()
  run(): Readonly<{ reached: true }> {
    return controllerAction();
  }
}

@Module({
  controllers: [ProtectedActionController],
  imports: [IdentityModule],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Test module carries Nest runtime metadata.
class ProtectedActionModule {}

const edgeHeaders = (method: string, url: string): Record<string, string> => {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const subject = "employee-suspension-test";
  const canonical = [
    "v1",
    method.toUpperCase(),
    url,
    subject,
    edgeIssuer,
    "true",
    issuedAt,
  ].join("\n");
  return {
    "x-huoqiu-alpha-access": "true",
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": edgeIssuer,
    "x-huoqiu-edge-signature": `v1=${createHmac("sha256", edgeSecret).update(canonical).digest("hex")}`,
    "x-huoqiu-edge-subject": subject,
  };
};

const applications = new Set<NestFastifyApplication>();
const environmentKeys = [
  "ALPHA_INVITE_CODES",
  "APP_ENV",
  "BETTER_AUTH_SECRET",
  "ZERO_TRUST_HMAC_SECRET",
  "ZERO_TRUST_ISSUER",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  controllerAction.mockClear();
  process.env.ALPHA_INVITE_CODES = inviteCode;
  process.env.APP_ENV = "test";
  process.env.BETTER_AUTH_SECRET = authSecret;
  process.env.ZERO_TRUST_HMAC_SECRET = edgeSecret;
  process.env.ZERO_TRUST_ISSUER = edgeIssuer;
});

afterEach(async () => {
  await Promise.all(
    [...applications].map(async (application) => {
      applications.delete(application);
      await application.close();
    }),
  );
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

describe("strong suspension checks", () => {
  it("invalidates an active session and SSE token before a business controller runs", async () => {
    const application = await createHttpApp({
      rootModule: ProtectedActionModule,
    });
    applications.add(application);
    const server = application.getHttpAdapter().getInstance();
    const authService = application.get(AuthService);
    const registration = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "suspend-register",
      },
      payload: {
        display_name: "待封禁员工",
        email: "suspended@huoqiu.test",
        invite_code: inviteCode,
        password: "correct-horse-battery-staple",
      },
    });
    const actorId = registration.json().session.actor.actor_id as string;
    const cookie = String(registration.headers["set-cookie"]);
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": "suspend-login",
      },
      payload: {
        email: "suspended@huoqiu.test",
        password: "correct-horse-battery-staple",
        transport: "bearer",
      },
    });
    const token = String(login.headers["set-auth-token"]);
    const sseToken = await authService.issueSseToken(actorId);

    const beforeSuspension = await server.inject({
      method: "GET",
      url: "/protected-action",
      headers: {
        ...edgeHeaders("GET", "/protected-action"),
        authorization: `Bearer ${token}`,
      },
    });
    expect(beforeSuspension.statusCode).toBe(200);
    const cookieBeforeSuspension = await server.inject({
      method: "GET",
      url: "/protected-action",
      headers: {
        ...edgeHeaders("GET", "/protected-action"),
        cookie,
      },
    });
    expect(cookieBeforeSuspension.statusCode).toBe(200);
    expect(controllerAction).toHaveBeenCalledTimes(2);
    await expect(authService.isSseTokenValid(sseToken)).resolves.toBe(true);

    await authService.suspendActor(actorId);
    controllerAction.mockClear();

    const replayedRegistrationAfterSuspension = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "suspend-register",
      },
      payload: {
        display_name: "待封禁员工",
        email: "suspended@huoqiu.test",
        invite_code: inviteCode,
        password: "correct-horse-battery-staple",
      },
    });
    expect(replayedRegistrationAfterSuspension.statusCode).toBe(403);
    expect(
      replayedRegistrationAfterSuspension.headers["set-auth-token"],
    ).toBeUndefined();
    expect(
      replayedRegistrationAfterSuspension.headers["set-cookie"],
    ).toBeUndefined();

    const afterSuspension = await server.inject({
      method: "GET",
      url: "/protected-action",
      headers: {
        ...edgeHeaders("GET", "/protected-action"),
        authorization: `Bearer ${token}`,
      },
    });
    expect(afterSuspension.statusCode).toBe(401);
    const cookieAfterSuspension = await server.inject({
      method: "GET",
      url: "/protected-action",
      headers: {
        ...edgeHeaders("GET", "/protected-action"),
        cookie,
      },
    });
    expect(cookieAfterSuspension.statusCode).toBe(401);
    expect(controllerAction).not.toHaveBeenCalled();
    await expect(authService.isSseTokenValid(sseToken)).resolves.toBe(false);

    const replayedLoginAfterSuspension = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": "suspend-login",
      },
      payload: {
        email: "suspended@huoqiu.test",
        password: "correct-horse-battery-staple",
        transport: "bearer",
      },
    });
    expect(replayedLoginAfterSuspension.statusCode).toBe(403);
    expect(
      replayedLoginAfterSuspension.headers["set-auth-token"],
    ).toBeUndefined();
    expect(replayedLoginAfterSuspension.headers["set-cookie"]).toBeUndefined();

    const relogin = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": "suspend-relogin",
      },
      payload: {
        email: "suspended@huoqiu.test",
        password: "correct-horse-battery-staple",
        transport: "bearer",
      },
    });
    expect(relogin.statusCode).toBe(403);
    expect(relogin.headers["set-auth-token"]).toBeUndefined();
  });

  it("rejects an unsigned edge request before session and action checks", async () => {
    const application = await createHttpApp({
      rootModule: ProtectedActionModule,
    });
    applications.add(application);
    const server = application.getHttpAdapter().getInstance();

    const response = await server.inject({
      method: "GET",
      url: "/protected-action",
      headers: { authorization: "Bearer never-reached" },
    });

    expect(response.statusCode).toBe(401);
    expect(controllerAction).not.toHaveBeenCalled();
  });

  it("revokes the just-issued provider session when a suspended actor attempts login", async () => {
    const credential = {
      fingerprint: "a".repeat(64),
      transport: "bearer" as const,
    } as AuthCredentialCapability;
    const revokeSubjectSessions = vi.fn(async () => undefined);
    const provider: AuthProviderPort = {
      login: vi.fn(async () => ({
        credential,
        expiresAt: new Date("2026-08-10T12:00:00.000Z"),
        subjectId: "identity-subject-suspended",
      })),
      logout: vi.fn(async () => undefined),
      register: vi.fn(async () => {
        throw new Error("not used");
      }),
      resolveSession: vi.fn(async () => null),
      revokeSubjectSessions,
    };
    const store = new InMemoryIdentityStore([inviteCode]);
    const created = await store.consumeInvitationAndCreateActor(
      {
        displayName: "停用测试",
        email: "suspended-unit@huoqiu.test",
        inviteCode,
      },
      async () => ({
        subjectId: "identity-subject-suspended",
      }),
    );
    await store.suspendActor(created.actor.actorId);
    const service = new AuthService(
      provider,
      store,
      new BoundedIdempotencyStore({ secret: authSecret }),
    );

    let status: number | undefined;
    try {
      await service.login({
        body: {
          email: "suspended-unit@huoqiu.test",
          password: "correct-horse-battery-staple",
          transport: "bearer",
        },
        callerId: "suspension-unit-test",
        idempotencyKey: "suspended-login-unit",
      });
    } catch (error) {
      status = error instanceof HttpException ? error.getStatus() : undefined;
    }

    expect(status).toBe(403);
    expect(revokeSubjectSessions).toHaveBeenCalledExactlyOnceWith(
      "identity-subject-suspended",
    );
  });

  it("rejects a cached registration after suspension without provisioning twice", async () => {
    const credential = {
      fingerprint: "b".repeat(64),
      transport: "cookie" as const,
    } as AuthCredentialCapability;
    const register = vi.fn(async () => ({
      credential,
      expiresAt: new Date("2026-08-10T12:00:00.000Z"),
      subjectId: "identity-subject-register-replay",
    }));
    const provider: AuthProviderPort = {
      login: vi.fn(async () => {
        throw new Error("not used");
      }),
      logout: vi.fn(async () => undefined),
      register,
      resolveSession: vi.fn(async () => null),
      revokeSubjectSessions: vi.fn(async () => undefined),
    };
    const store = new InMemoryIdentityStore([inviteCode]);
    const service = new AuthService(
      provider,
      store,
      new BoundedIdempotencyStore({ secret: authSecret }),
    );
    const input = {
      body: {
        display_name: "注册重放测试",
        email: "register-replay@huoqiu.test",
        invite_code: inviteCode,
        password: "correct-horse-battery-staple",
      },
      callerId: "registration-replay-unit-test",
      idempotencyKey: "registration-replay-key",
    };

    const registration = await service.register(input);
    await service.suspendActor(registration.actor.actorId);

    await expect(service.register(input)).rejects.toMatchObject({
      status: 403,
    });
    expect(register).toHaveBeenCalledOnce();
    expect(store.actorCount()).toBe(1);
  });
});
