import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TRANSPORT,
  config,
  createAdminAccessMiddleware,
  evaluateAdminAccess,
  loadAdminAccessConfig,
  middleware,
} from "./middleware";

const NOW_MILLISECONDS = 1_786_291_200_000;
const NOW_SECONDS = Math.floor(NOW_MILLISECONDS / 1000);
const ZERO_TRUST_ISSUER = "huoqiu-zero-trust";
const ZERO_TRUST_SECRET = "0123456789abcdef0123456789abcdef";
const SESSION_TOKEN = "opaque-better-auth-session";

const runtimeConfig = loadAdminAccessConfig({
  APP_ENV: "test",
  ZERO_TRUST_HMAC_SECRET: ZERO_TRUST_SECRET,
  ZERO_TRUST_ISSUER,
});

const encodeHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const signEdgeProof = async (properties: {
  alphaAccess: string;
  issuedAt: string;
  method: string;
  pathAndSearch: string;
  subject: string;
}): Promise<string> => {
  const canonical = [
    "v1",
    properties.method.toUpperCase(),
    properties.pathAndSearch,
    properties.subject,
    ZERO_TRUST_ISSUER,
    properties.alphaAccess,
    properties.issuedAt,
  ].join("\n");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ZERO_TRUST_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonical),
  );

  return `v1=${encodeHex(signature)}`;
};

type RequestOverrides = Readonly<{
  adminRole?: string | null;
  alphaAccess?: string | null;
  authorization?: string | null;
  body?: BodyInit;
  cookie?: string | null;
  issuedAt?: string | null;
  method?: string;
  signature?: string | null;
  subject?: string | null;
  url?: string;
}>;

const createSignedRequest = async (
  overrides: RequestOverrides = {},
): Promise<NextRequest> => {
  const url = new URL(
    overrides.url ??
      "https://admin.huoqiu.test/admin/moderation?queue=reviewing",
  );
  const method = overrides.method ?? "GET";
  const subject =
    overrides.subject === undefined ? "employee-42" : overrides.subject;
  const alphaAccess =
    overrides.alphaAccess === undefined ? "true" : overrides.alphaAccess;
  const issuedAt =
    overrides.issuedAt === undefined ? String(NOW_SECONDS) : overrides.issuedAt;
  const headers = new Headers({ accept: "text/html" });

  if (subject !== null) {
    headers.set("x-huoqiu-edge-subject", subject);
  }
  headers.set("x-huoqiu-edge-issuer", ZERO_TRUST_ISSUER);
  if (alphaAccess !== null) {
    headers.set("x-huoqiu-alpha-access", alphaAccess);
  }
  if (issuedAt !== null) {
    headers.set("x-huoqiu-edge-issued-at", issuedAt);
  }
  if (overrides.adminRole !== null && overrides.adminRole !== undefined) {
    headers.set("x-huoqiu-admin-role", overrides.adminRole);
  }
  if (overrides.cookie !== null) {
    headers.set(
      "cookie",
      overrides.cookie ??
        `${ADMIN_SESSION_COOKIE.name}=${SESSION_TOKEN}; preference=compact`,
    );
  }
  if (
    overrides.authorization !== null &&
    overrides.authorization !== undefined
  ) {
    headers.set("authorization", overrides.authorization);
  }

  if (overrides.signature !== null) {
    headers.set(
      "x-huoqiu-edge-signature",
      overrides.signature ??
        (await signEdgeProof({
          alphaAccess: alphaAccess ?? "",
          issuedAt: issuedAt ?? String(NOW_SECONDS),
          method,
          pathAndSearch: `${url.pathname}${url.search}`,
          subject: subject ?? "employee-42",
        })),
    );
  }

  return new NextRequest(url, {
    headers,
    method,
    nextConfig: { basePath: "/admin" },
    ...(overrides.body === undefined ? {} : { body: overrides.body }),
  });
};

const gate = createAdminAccessMiddleware(runtimeConfig, {
  now: () => NOW_MILLISECONDS,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin Zero Trust configuration", () => {
  it.each(["production", "staging"])(
    "fails closed before handling requests in %s without verifier configuration",
    async (appEnvironment) => {
      vi.stubEnv("APP_ENV", appEnvironment);
      vi.stubEnv("ZERO_TRUST_HMAC_SECRET", "");
      vi.stubEnv("ZERO_TRUST_ISSUER", "");

      const healthRequest = new NextRequest(
        "https://admin.huoqiu.test/admin/healthz",
        { nextConfig: { basePath: "/admin" } },
      );

      await expect(middleware(healthRequest)).rejects.toThrow(
        "ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED",
      );
    },
  );

  it("requires explicit development/test configuration and has no production test bypass", () => {
    expect(() =>
      loadAdminAccessConfig({ APP_ENV: "test", NODE_ENV: "test" }),
    ).toThrow("ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED");

    expect(() =>
      loadAdminAccessConfig({
        APP_ENV: "production",
        HUOQIU_TEST_EDGE_BYPASS: "true",
        ZERO_TRUST_TEST_SECRET: ZERO_TRUST_SECRET,
      }),
    ).toThrow("ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED");
  });

  it("loads the shared verifier protocol with the fixed 300 second skew", () => {
    expect(runtimeConfig).toMatchObject({
      appEnvironment: "test",
      issuer: ZERO_TRUST_ISSUER,
      maxSkewSeconds: 300,
    });
  });
});

describe("admin matcher and exact public allowlist", () => {
  it("matches the complete admin base path and nothing outside it", () => {
    const nextConfig = { basePath: "/admin" };

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "https://admin.huoqiu.test/admin",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "https://admin.huoqiu.test/admin/moderation",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "https://admin.huoqiu.test/admin/_next/static/chunk.js",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "https://admin.huoqiu.test/moderation",
      }),
    ).toBe(false);
  });

  it.each(["/admin/healthz", "/admin/_next/static/chunks/app.js"])(
    "allows only the exact health/static public path %s",
    async (path) => {
      const response = await gate(
        new NextRequest(`https://admin.huoqiu.test${path}`, {
          nextConfig: { basePath: "/admin" },
        }),
      );

      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it.each([
    "/admin/healthz/",
    "/admin/api/healthz",
    "/admin/_next/static",
    "/admin/_next/static-evil/chunk.js",
    "/admin/_next/static/%0aevil.js",
    "/admin/_next/static/chunks/app.js?session_token=query-secret",
    "/admin/_next/image",
  ])("does not broaden the public bypass to %s", async (path) => {
    const response = await gate(
      new NextRequest(`https://admin.huoqiu.test${path}`, {
        nextConfig: { basePath: "/admin" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("does not treat the existing admin root page as a sessionless entry", async () => {
    const bareResponse = await gate(
      new NextRequest("https://admin.huoqiu.test/admin", {
        nextConfig: { basePath: "/admin" },
      }),
    );
    const edgeAndAlphaWithoutSession = await gate(
      await createSignedRequest({
        cookie: null,
        url: "https://admin.huoqiu.test/admin",
      }),
    );

    expect(bareResponse.status).toBe(403);
    expect(edgeAndAlphaWithoutSession.status).toBe(403);
    expect(
      edgeAndAlphaWithoutSession.headers.get("x-middleware-next"),
    ).toBeNull();
  });
});

describe("ordered admin access chain", () => {
  it("evaluates edge proof, alpha, then cookie session presence in that order", async () => {
    const missingEverything = new NextRequest(
      "https://admin.huoqiu.test/admin/moderation",
      { nextConfig: { basePath: "/admin" } },
    );
    const missingAlpha = await createSignedRequest({
      alphaAccess: null,
      cookie: null,
    });
    const missingSession = await createSignedRequest({ cookie: null });

    await expect(
      evaluateAdminAccess(missingEverything, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "edge_proof", kind: "deny" });
    await expect(
      evaluateAdminAccess(missingAlpha, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "alpha_access", kind: "deny" });
    await expect(
      evaluateAdminAccess(missingSession, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "session", kind: "deny" });
  });

  it.each([
    ["missing", null],
    ["malformed", "not-a-versioned-signature"],
    ["invalid", `v1=${"0".repeat(64)}`],
  ])(
    "rejects a %s edge signature before the page",
    async (_label, signature) => {
      const response = await gate(await createSignedRequest({ signature }));

      expect(response.status).toBe(403);
      expect(response.headers.get("x-middleware-next")).toBeNull();
    },
  );

  it("binds the proof to subject, path, query, and issuer", async () => {
    const original = await createSignedRequest();
    const subjectHeaders = new Headers(original.headers);
    subjectHeaders.set("x-huoqiu-edge-subject", "employee-99");
    const subjectTamper = new NextRequest(original.url, {
      headers: subjectHeaders,
      nextConfig: { basePath: "/admin" },
    });
    const queryTamper = new NextRequest(
      "https://admin.huoqiu.test/admin/moderation?queue=approved",
      {
        headers: original.headers,
        nextConfig: { basePath: "/admin" },
      },
    );
    const wrongIssuerHeaders = new Headers(original.headers);
    wrongIssuerHeaders.set("x-huoqiu-edge-issuer", "untrusted-issuer");
    const wrongIssuer = new NextRequest(original.url, {
      headers: wrongIssuerHeaders,
      nextConfig: { basePath: "/admin" },
    });

    for (const request of [subjectTamper, queryTamper, wrongIssuer]) {
      await expect(
        evaluateAdminAccess(request, runtimeConfig, {
          now: () => NOW_MILLISECONDS,
        }),
      ).resolves.toMatchObject({ checkpoint: "edge_proof", kind: "deny" });
    }
  });

  it("rejects an otherwise valid proof outside the configured clock skew", async () => {
    const request = await createSignedRequest({
      issuedAt: String(NOW_SECONDS - 301),
    });

    await expect(
      evaluateAdminAccess(request, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "edge_proof", kind: "deny" });
  });

  it.each([null, "false", "TRUE"])(
    "rejects missing or non-literal alpha access (%s)",
    async (alphaAccess) => {
      const request = await createSignedRequest({ alphaAccess });

      await expect(
        evaluateAdminAccess(request, runtimeConfig, {
          now: () => NOW_MILLISECONDS,
        }),
      ).resolves.toMatchObject({ checkpoint: "alpha_access", kind: "deny" });
    },
  );

  it("detects a signed false alpha claim changed to true", async () => {
    const signedFalse = await createSignedRequest({ alphaAccess: "false" });
    const tamperedHeaders = new Headers(signedFalse.headers);
    tamperedHeaders.set("x-huoqiu-alpha-access", "true");
    const tampered = new NextRequest(signedFalse.url, {
      headers: tamperedHeaders,
      nextConfig: { basePath: "/admin" },
    });

    await expect(
      evaluateAdminAccess(tampered, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "edge_proof", kind: "deny" });
  });

  it.each([null, "user", "admin"])(
    "does not trust a missing or forged Admin role header (%s)",
    async (adminRole) => {
      const request = await createSignedRequest({ adminRole });

      await expect(
        evaluateAdminAccess(request, runtimeConfig, {
          now: () => NOW_MILLISECONDS,
        }),
      ).resolves.toEqual({
        kind: "allow",
        nextAuthorization: "api_session_role_action_ownership",
        scope: "protected",
      });
      const response = await gate(request);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-huoqiu-action-authorized")).toBeNull();
      expect(response.headers.get("x-huoqiu-admin-role")).toBeNull();
    },
  );

  it("strips all known forged role assertions before forwarding", async () => {
    const original = await createSignedRequest({ adminRole: "admin" });
    const headers = new Headers(original.headers);
    headers.set("x-huoqiu-admin-roles", "admin");
    headers.set("x-huoqiu-authenticated-role", "admin");
    headers.set("x-huoqiu-authenticated-roles", "admin");
    headers.set("x-huoqiu-action-authorized", "true");
    headers.set("x-huoqiu-ownership-authorized", "true");
    headers.set("x-huoqiu-session-valid", "true");
    const request = new NextRequest(original.url, {
      headers,
      nextConfig: { basePath: "/admin" },
    });

    const response = await gate(request);
    const forwardedNames = new Set(
      (response.headers.get("x-middleware-override-headers") ?? "")
        .split(",")
        .filter(Boolean),
    );

    for (const headerName of [
      "x-huoqiu-admin-role",
      "x-huoqiu-admin-roles",
      "x-huoqiu-authenticated-role",
      "x-huoqiu-authenticated-roles",
      "x-huoqiu-action-authorized",
      "x-huoqiu-ownership-authorized",
      "x-huoqiu-session-valid",
    ]) {
      expect(forwardedNames).not.toContain(headerName);
      expect(
        response.headers.get(`x-middleware-request-${headerName}`),
      ).toBeNull();
    }
    expect(forwardedNames).toContain("cookie");
    expect(forwardedNames).toContain("x-huoqiu-edge-signature");
  });
});

describe("cookie-only session and safe denials", () => {
  it("publishes the sole session cookie with immutable secure attributes", () => {
    expect(ADMIN_SESSION_TRANSPORT).toBe("cookie");
    expect(ADMIN_SESSION_COOKIE).toEqual({
      httpOnly: true,
      name: "__Secure-huoqiu.session_token",
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(ADMIN_SESSION_COOKIE).not.toHaveProperty("domain");
    expect(Object.isFrozen(ADMIN_SESSION_COOKIE)).toBe(true);
  });

  it("does not accept query, body, or Bearer credentials instead of the cookie", async () => {
    const queryRequest = await createSignedRequest({
      cookie: null,
      url: "https://admin.huoqiu.test/admin/moderation?session_token=query-secret",
    });
    const bodyRequest = await createSignedRequest({
      authorization: "Bearer header-secret",
      body: JSON.stringify({ session_token: "body-secret" }),
      cookie: null,
      method: "POST",
    });

    await expect(
      evaluateAdminAccess(queryRequest, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "session", kind: "deny" });
    const bodyResponse = await gate(bodyRequest);
    expect(bodyResponse.status).toBe(403);
    expect(bodyResponse.headers.get("location")).toBeNull();
    expect(bodyRequest.bodyUsed).toBe(false);
  });

  it("rejects Bearer credentials even when a session cookie is also present", async () => {
    const request = await createSignedRequest({
      authorization: "Bearer must-not-coexist",
    });

    await expect(
      evaluateAdminAccess(request, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "session", kind: "deny" });
  });

  it("rejects ambiguous duplicate session cookies", async () => {
    const request = await createSignedRequest({
      cookie: `${ADMIN_SESSION_COOKIE.name}=first; ${ADMIN_SESSION_COOKIE.name}=second`,
    });

    await expect(
      evaluateAdminAccess(request, runtimeConfig, {
        now: () => NOW_MILLISECONDS,
      }),
    ).resolves.toMatchObject({ checkpoint: "session", kind: "deny" });
  });

  it("fails closed without following an attacker-controlled return target", async () => {
    const request = await createSignedRequest({
      cookie: null,
      url: "https://admin.huoqiu.test/admin/moderation?returnTo=https://evil.test/steal",
    });

    const response = await gate(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never echoes proof, cookie, invite, or token material in denials or logs", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const request = await createSignedRequest({
      signature: `v1=${"f".repeat(64)}`,
      url: "https://admin.huoqiu.test/admin/moderation?invite_code=invite-secret",
    });

    const response = await gate(request);
    const serializedResponse = `${[...response.headers].join(" ")} ${await response.text()}`;

    expect(serializedResponse).not.toMatch(
      /invite-secret|opaque-better-auth-session|v1=f{64}/u,
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
