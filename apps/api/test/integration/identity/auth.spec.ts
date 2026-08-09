import { createHmac } from "node:crypto";

import { m1Router } from "@huoqiu/contracts/m1";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AuthService as NestBetterAuthService } from "@thallesp/nestjs-better-auth";
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
import { BoundedIdempotencyRegistry } from "../../../src/identity/idempotency-registry.js";
import { createHttpApp } from "../../../src/main.js";

const edgeSecret = "alpha-edge-test-secret-with-at-least-32-characters";
const edgeIssuer = "huoqiu-test-edge";
const authSecret =
  "better-auth-test-secret-with-at-least-thirty-two-characters";
const inviteCode = "INVITE-ALPHA-0001";
const secondInviteCode = "INVITE-ALPHA-0002";
const thirdInviteCode = "INVITE-ALPHA-0003";

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
  process.env.ALPHA_INVITE_CODES = [
    inviteCode,
    secondInviteCode,
    thirdInviteCode,
  ].join(",");
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

  it("uses the frozen contracts for body, header, malformed JSON, and provider conflict errors", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();

    const missingHeader = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: edgeHeaders("POST", "/v1/auth/register"),
      payload: registerBody,
    });
    expect(missingHeader.statusCode).toBe(400);
    expect(() =>
      m1Router.authRegister.responses[400].parse(missingHeader.json()),
    ).not.toThrow();

    const bodySmuggling = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-body-smuggling",
      },
      payload: { ...registerBody, idempotencyKey: "body-copy" },
    });
    expect(bodySmuggling.statusCode).toBe(400);
    expect(() =>
      m1Router.authRegister.responses[400].parse(bodySmuggling.json()),
    ).not.toThrow();

    const malformedJson = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "content-type": "application/json",
        "idempotency-key": "login-malformed-json",
      },
      payload: '{"email":',
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(() =>
      m1Router.authLogin.responses[400].parse(malformedJson.json()),
    ).not.toThrow();
    expect(malformedJson.body).not.toMatch(/json|parse|position|unexpected/iu);

    const duplicateIdempotencyHeader = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": ["duplicate-key-a", "duplicate-key-b"],
      } as unknown as Record<string, string>,
      payload: {
        email: registerBody.email,
        password: registerBody.password,
        transport: "bearer",
      },
    });
    expect(duplicateIdempotencyHeader.statusCode).toBe(400);
    expect(() =>
      m1Router.authLogin.responses[400].parse(
        duplicateIdempotencyHeader.json(),
      ),
    ).not.toThrow();

    const registered = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-provider-conflict-a",
      },
      payload: registerBody,
    });
    expect(registered.statusCode).toBe(201);
    const duplicateProviderIdentity = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-provider-conflict-b",
      },
      payload: {
        ...registerBody,
        invite_code: secondInviteCode,
      },
    });
    expect(duplicateProviderIdentity.statusCode).toBe(409);
    expect(() =>
      m1Router.authRegister.responses[409].parse(
        duplicateProviderIdentity.json(),
      ),
    ).not.toThrow();
    expect(duplicateProviderIdentity.statusCode).not.toBe(422);
    expect(duplicateProviderIdentity.body).not.toMatch(
      /better.?auth|sqlite|unique|provider/iu,
    );
  });

  it("replays concurrent register and login outcomes without issuing a second actor or credential", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();
    const registerRequest = {
      method: "POST" as const,
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-idempotent-concurrent",
      },
      payload: registerBody,
    };

    const registrations = await Promise.all([
      server.inject(registerRequest),
      server.inject(registerRequest),
    ]);
    expect(registrations.map(({ statusCode }) => statusCode)).toEqual([
      201, 201,
    ]);
    expect(registrations[0]?.json().session.actor.actor_id).toBe(
      registrations[1]?.json().session.actor.actor_id,
    );
    expect(registrations[0]?.headers["set-cookie"]).toBe(
      registrations[1]?.headers["set-cookie"],
    );
    const changedRegistration = await server.inject({
      ...registerRequest,
      payload: { ...registerBody, display_name: "changed" },
    });
    expect(changedRegistration.statusCode).toBe(409);

    const loginRequest = {
      method: "POST" as const,
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        "idempotency-key": "login-idempotent-concurrent",
      },
      payload: {
        email: registerBody.email,
        password: registerBody.password,
        transport: "bearer",
      },
    };
    const logins = await Promise.all([
      server.inject(loginRequest),
      server.inject(loginRequest),
    ]);
    expect(logins.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(logins[0]?.headers["set-auth-token"]).toBe(
      logins[1]?.headers["set-auth-token"],
    );

    const changedRequest = await server.inject({
      ...loginRequest,
      payload: { ...loginRequest.payload, password: "different-password" },
    });
    expect(changedRequest.statusCode).toBe(409);
    expect(() =>
      m1Router.authLogin.responses[409].parse(changedRequest.json()),
    ).not.toThrow();
  });

  it("validates every credential shape even on session-optional endpoints", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();
    const optionalCases = [
      { authorization: "" },
      { authorization: "Basic Zm9vOmJhcg==" },
      { authorization: "Bearer" },
      { authorization: "Bearer token, Bearer token" },
      { authorization: "Bearer token", cookie: "analytics=1" },
    ];

    for (const [index, credentialHeaders] of optionalCases.entries()) {
      const response = await server.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: {
          ...edgeHeaders("POST", "/v1/auth/login"),
          ...credentialHeaders,
          "idempotency-key": `invalid-transport-${String(index).padStart(2, "0")}`,
        },
        payload: {
          email: registerBody.email,
          password: registerBody.password,
          transport: "bearer",
        },
      });
      expect(response.statusCode).toBe(401);
      expect(() =>
        m1Router.authLogin.responses[401].parse(response.json()),
      ).not.toThrow();
    }

    const duplicatedAuthorization = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/login"),
        authorization: [
          "Bearer syntactically-valid",
          "Bearer syntactically-valid",
        ],
        "idempotency-key": "invalid-transport-duplicate",
      } as unknown as Record<string, string>,
      payload: {
        email: registerBody.email,
        password: registerBody.password,
        transport: "bearer",
      },
    });
    expect(duplicatedAuthorization.statusCode).toBe(401);
  });

  it("rejects ambiguous credentials on register, session, and logout before controller work", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();

    const rejectedRegister = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        authorization: "Basic Zm9vOmJhcg==",
        "idempotency-key": "register-invalid-credential",
      },
      payload: registerBody,
    });
    expect(rejectedRegister.statusCode).toBe(401);

    const registration = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "register-after-invalid-credential",
      },
      payload: registerBody,
    });
    expect(registration.statusCode).toBe(201);
    const cookiePair = String(registration.headers["set-cookie"]).split(
      ";",
      1,
    )[0];

    const cookieSession = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        cookie: cookiePair,
      },
    });
    expect(cookieSession.statusCode).toBe(200);

    const duplicateCookieSession = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        cookie: `${cookiePair}; ${cookiePair}`,
      },
    });
    expect(duplicateCookieSession.statusCode).toBe(401);

    const ambiguousLogout = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        authorization: "Bearer syntactically-valid",
        cookie: cookiePair,
        "idempotency-key": "logout-ambiguous-credential",
      },
      payload: {},
    });
    expect(ambiguousLogout.statusCode).toBe(401);
    expect(() =>
      m1Router.authLogout.responses[401].parse(ambiguousLogout.json()),
    ).not.toThrow();
  });

  it("integrates the selected Nest adapter with provider controllers disabled", async () => {
    const application = await createApplication();
    expect(application.get(NestBetterAuthService)).toBeDefined();
    const response = await application
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: "/api/auth/get-session",
        headers: edgeHeaders("GET", "/api/auth/get-session"),
      });
    expect(response.statusCode).toBe(404);
  });

  it("keeps concurrent invitation consumption atomic", async () => {
    const runtime = await createProcessLocalBetterAuthRuntime({
      secret: authSecret,
    });
    const provider = new BetterAuthProviderAdapter(runtime);
    const store = new InMemoryIdentityStore([inviteCode]);
    const service = new AuthService(
      provider,
      store,
      new BoundedIdempotencyRegistry({ secret: authSecret }),
    );

    try {
      const attempts = await Promise.allSettled([
        service.register({
          body: registerBody,
          callerId: "concurrency-test",
          idempotencyKey: "parallel-register-1",
        }),
        service.register({
          body: { ...registerBody, email: "parallel@huoqiu.test" },
          callerId: "concurrency-test",
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
        successful.value.actor.identitySubjectId,
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
    expect(bearerWithUnrelatedCookie.statusCode).toBe(401);

    const mixedCaseBearer = await server.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...edgeHeaders("GET", "/v1/auth/session"),
        authorization: `bEaReR ${String(token)}`,
      },
    });
    expect(mixedCaseBearer.statusCode).toBe(200);

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

    const logoutReplay = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        authorization: `Bearer ${String(token)}`,
        "idempotency-key": "logout-bearer-user",
      },
      payload: {},
    });
    expect(logoutReplay.statusCode).toBe(200);
    expect(logoutReplay.json().revoked).toBe(logout.json().revoked);
    expect(logoutReplay.json().trace_id).not.toBe(logout.json().trace_id);

    const changedLogout = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        authorization: `Bearer ${String(token)}`,
        "idempotency-key": "logout-bearer-user",
      },
      payload: { device_binding_id: "device_changed" },
    });
    expect(changedLogout.statusCode).toBe(409);

    const differentKeyReplay = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        authorization: `Bearer ${String(token)}`,
        "idempotency-key": "logout-bearer-different-key",
      },
      payload: {},
    });
    expect(differentKeyReplay.statusCode).toBe(401);

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

  it("records a durable-in-process device revocation tombstone exactly once", async () => {
    const application = await createApplication();
    const server = application.getHttpAdapter().getInstance();
    const registration = await server.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/register"),
        "idempotency-key": "device-register",
      },
      payload: registerBody,
    });
    const actorId = registration.json().session.actor.actor_id as string;
    const cookie = String(registration.headers["set-cookie"]);
    const request = {
      method: "POST" as const,
      url: "/v1/auth/logout",
      headers: {
        ...edgeHeaders("POST", "/v1/auth/logout"),
        cookie,
        "idempotency-key": "device-logout-idempotent",
      },
      payload: { device_binding_id: "device_web_001" },
    };
    const first = await server.inject(request);
    const second = await server.inject(request);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    await expect(
      application
        .get(AuthService)
        .isDeviceBindingRevoked(actorId, "device_web_001"),
    ).resolves.toBe(true);
  });
});
