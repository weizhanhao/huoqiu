import { createHmac } from "node:crypto";

import { m1Router } from "@huoqiu/contracts/m1";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module.js";
import {
  AuthService,
  InMemoryIdentityStore,
} from "../../../src/identity/auth.service.js";
import {
  BetterAuthProviderAdapter,
  createProcessLocalBetterAuthRuntime,
} from "../../../src/identity/auth-provider.adapter.js";
import { createHttpApp } from "../../../src/main.js";

const edgeSecret = "alpha-edge-test-secret-with-at-least-32-characters";
const edgeIssuer = "huoqiu-test-edge";
const authSecret =
  "better-auth-test-secret-with-at-least-thirty-two-characters";
const inviteCode = "INVITE-ALPHA-0001";

const edgeHeaders = (method: string, url: string): Record<string, string> => {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const subject = "employee-001";
  const alphaAccess = "true";
  const canonical = [
    "v1",
    method.toUpperCase(),
    url,
    subject,
    edgeIssuer,
    alphaAccess,
    issuedAt,
  ].join("\n");
  const signature = createHmac("sha256", edgeSecret)
    .update(canonical)
    .digest("hex");

  return {
    "x-huoqiu-alpha-access": alphaAccess,
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": edgeIssuer,
    "x-huoqiu-edge-signature": `v1=${signature}`,
    "x-huoqiu-edge-subject": subject,
  };
};

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
const applications = new Set<NestFastifyApplication>();

beforeEach(() => {
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

const createApplication = async (): Promise<NestFastifyApplication> => {
  const application = await createHttpApp({ rootModule: AppModule });
  applications.add(application);
  return application;
};

const registerBody = {
  display_name: "火球员工",
  email: "employee@huoqiu.test",
  invite_code: inviteCode,
  password: "correct-horse-battery-staple",
};

describe("API-AUTH-001..004", () => {
  it("registers once, emits only a secure Web cookie and matches the public contract", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();
    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-0001",
      },
      payload: registerBody,
    });

    expect(response.statusCode).toBe(201);
    expect(() =>
      m1Router.authRegister.responses[201].parse(response.json()),
    ).not.toThrow();
    expect(response.headers["set-cookie"]).toMatch(
      /^__Secure-huoqiu\.session_token=/u,
    );
    expect(response.headers["set-cookie"]).toMatch(/; HttpOnly(?:;|$)/iu);
    expect(response.headers["set-cookie"]).toMatch(/; Secure(?:;|$)/iu);
    expect(response.headers["set-cookie"]).toMatch(/; SameSite=Lax(?:;|$)/iu);
    expect(response.headers["set-cookie"]).not.toMatch(/Domain=/iu);
    expect(response.headers["set-auth-token"]).toBeUndefined();
    expect(response.body).not.toMatch(/session_token|invite_code/iu);
    expect(response.json()).not.toHaveProperty("token");
    expect(response.json()).not.toHaveProperty("cookie");

    const replay = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-0002",
      },
      payload: {
        ...registerBody,
        email: "second@huoqiu.test",
      },
    });
    expect(replay.statusCode).toBe(409);
    expect(() =>
      m1Router.authRegister.responses[409].parse(replay.json()),
    ).not.toThrow();
    expect(replay.body).not.toContain(inviteCode);
  });

  it("keeps concurrent invitation consumption atomic", async () => {
    const runtime = await createProcessLocalBetterAuthRuntime({
      secret: authSecret,
    });
    const provider = new BetterAuthProviderAdapter(runtime);
    const store = new InMemoryIdentityStore([inviteCode]);
    const service = new AuthService(provider, store);

    try {
      const attempts = await Promise.allSettled([
        service.register({
          ...registerBody,
          idempotencyKey: "parallel-register-1",
        }),
        service.register({
          ...registerBody,
          email: "parallel@huoqiu.test",
          idempotencyKey: "parallel-register-2",
        }),
      ]);

      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        attempts.filter((attempt) => attempt.status === "rejected"),
      ).toHaveLength(1);
      expect(store.invitationState(inviteCode)).toBe("consumed");
      expect(store.actorCount()).toBe(1);
      const successful = attempts.find(
        (attempt) => attempt.status === "fulfilled",
      );
      if (successful?.status !== "fulfilled") {
        throw new Error("Expected exactly one successful registration");
      }
      expect(successful.value.actor.actorId).not.toContain(
        successful.value.actor.providerUserId,
      );
    } finally {
      await runtime.close();
    }
  });

  it("returns a signed App credential only in a response header and revokes it on logout", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();
    const registration = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-bearer-user",
      },
      payload: registerBody,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": "login-bearer-user",
      },
      payload: {
        email: registerBody.email,
        password: registerBody.password,
        transport: "bearer",
      },
    });

    expect(login.statusCode).toBe(200);
    expect(() =>
      m1Router.authLogin.responses[200].parse(login.json()),
    ).not.toThrow();
    const token = login.headers["set-auth-token"];
    expect(token).toMatch(/^[^.]+\.[^.]+$/u);
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(login.body).not.toContain(String(token));

    const session = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        authorization: `Bearer ${String(token)}`,
        "x-huoqiu-admin-role": "admin",
      },
    });
    expect(session.statusCode).toBe(200);
    expect(() =>
      m1Router.authGetSession.responses[200].parse(session.json()),
    ).not.toThrow();
    expect(session.json()).toMatchObject({
      session: {
        actor: {
          display_name: registerBody.display_name,
          roles: ["user"],
        },
        transport: "bearer",
      },
    });

    const bearerWithUnrelatedCookie = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        authorization: `Bearer ${String(token)}`,
        cookie: "analytics_id=anonymous",
      },
    });
    expect(bearerWithUnrelatedCookie.statusCode).toBe(200);

    const dualSelectedTransports = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        authorization: `Bearer ${String(token)}`,
        cookie: String(registration.headers["set-cookie"]),
      },
    });
    expect(dualSelectedTransports.statusCode).toBe(401);

    const logout = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        authorization: `Bearer ${String(token)}`,
        "idempotency-key": "logout-bearer-user",
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(() =>
      m1Router.authLogout.responses[200].parse(logout.json()),
    ).not.toThrow();

    const replay = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        authorization: `Bearer ${String(token)}`,
      },
    });
    expect(replay.statusCode).toBe(401);
    expect(() =>
      m1Router.authGetSession.responses[401].parse(replay.json()),
    ).not.toThrow();
  });
});
