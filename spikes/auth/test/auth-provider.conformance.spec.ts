import { afterEach, describe, expect, it } from "vitest";

import {
  createBetterAuthProbe,
  type AuthProbe,
  type AuthProbeResponse,
} from "../better-auth/probe";
import { runKeycloakProbe } from "../keycloak/probe";

const baseHeaders = {
  host: "auth.huoqiu.test",
  origin: "https://auth.huoqiu.test",
  "x-forwarded-proto": "https",
};

const email = "employee@huoqiu.test";
const password = "correct-horse-battery-staple";

const probes: AuthProbe[] = [];

const createProbe = async (): Promise<AuthProbe> => {
  const probe = await createBetterAuthProbe();
  probes.push(probe);
  return probe;
};

const setCookieValues = (response: AuthProbeResponse): string[] => {
  const value = response.headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const sessionCookie = (response: AuthProbeResponse): string => {
  const raw = setCookieValues(response).find((value) =>
    value.includes("huoqiu.session_token="),
  );
  if (!raw) throw new Error("session cookie was not issued");
  return raw.split(";", 1)[0] ?? "";
};

const bearerToken = (response: AuthProbeResponse): string => {
  const value = response.headers["set-auth-token"];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("bearer token was not issued");
  }
  return value;
};

const register = async (probe: AuthProbe): Promise<AuthProbeResponse> =>
  await probe.inject({
    method: "POST",
    path: "/api/auth/sign-up/email",
    headers: baseHeaders,
    body: { email, name: "火球员工", password },
  });

const login = async (probe: AuthProbe): Promise<AuthProbeResponse> =>
  await probe.inject({
    method: "POST",
    path: "/api/auth/sign-in/email",
    headers: baseHeaders,
    body: { email, password },
  });

afterEach(async () => {
  await Promise.all(probes.splice(0).map(async (probe) => await probe.close()));
});

describe("Better Auth M1 conformance", () => {
  it("keeps the Keycloak fallback disabled after Better Auth is selected", async () => {
    await expect(runKeycloakProbe()).rejects.toThrow(
      "AUTH_PROVIDER_NOT_SELECTED:keycloak",
    );
  });

  it("runs registration, login, session and logout through Nest Fastify", async () => {
    const probe = await createProbe();
    const registration = await register(probe);
    expect(registration.statusCode).toBe(200);

    const signedIn = await login(probe);
    expect(signedIn.statusCode).toBe(200);
    const cookie = sessionCookie(signedIn);

    const session = await probe.inject({
      method: "GET",
      path: "/api/auth/get-session",
      headers: { ...baseHeaders, cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ user: { email } });

    const logout = await probe.inject({
      method: "POST",
      path: "/api/auth/sign-out",
      headers: { ...baseHeaders, cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ success: true });

    const loggedOutSession = await probe.inject({
      method: "GET",
      path: "/api/auth/get-session",
      headers: { ...baseHeaders, cookie },
    });
    expect(loggedOutSession.statusCode).toBe(200);
    expect(loggedOutSession.json()).toBeNull();
  });

  it("issues only HttpOnly Secure SameSite=Lax session cookies", async () => {
    const probe = await createProbe();
    await register(probe);

    const signedIn = await login(probe);
    const cookie = setCookieValues(signedIn).find((value) =>
      value.includes("huoqiu.session_token="),
    );

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/^__Secure-huoqiu\.session_token=/);
    expect(cookie).toMatch(/; HttpOnly(?:;|$)/i);
    expect(cookie).toMatch(/; Secure(?:;|$)/i);
    expect(cookie).toMatch(/; SameSite=Lax(?:;|$)/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("accepts the issued signed session token as a Bearer credential", async () => {
    const probe = await createProbe();
    await register(probe);

    const signedIn = await login(probe);
    const token = bearerToken(signedIn);
    const session = await probe.inject({
      method: "GET",
      path: "/api/auth/get-session",
      headers: { ...baseHeaders, authorization: `Bearer ${token}` },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ user: { email } });
  });

  it("revokes an active Bearer session and rejects replay", async () => {
    const probe = await createProbe();
    await register(probe);

    const signedIn = await login(probe);
    const token = bearerToken(signedIn);
    const authorization = `Bearer ${token}`;

    const revoked = await probe.inject({
      method: "POST",
      path: "/api/auth/revoke-sessions",
      headers: { ...baseHeaders, authorization },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toEqual({ status: true });

    const replay = await probe.inject({
      method: "GET",
      path: "/api/auth/get-session",
      headers: { ...baseHeaders, authorization },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toBeNull();
  });

  it("observes auth requests inside the Nest Fastify adapter lifecycle", async () => {
    const probe = await createProbe();
    expect(probe.adapterType).toBe("fastify");
    expect(probe.lifecycleEvents).toEqual([]);

    const registration = await register(probe);
    expect(registration.statusCode).toBe(200);
    expect(probe.lifecycleEvents).toContain("POST /api/auth/sign-up/email");
  });
});
