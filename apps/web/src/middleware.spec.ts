import { createHmac } from "node:crypto";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  config as middlewareConfig,
  enforceWebBoundary,
  middleware,
  WEB_SESSION_COOKIE,
} from "./middleware";
import {
  assertZeroTrustStartupConfiguration,
  loadZeroTrustConfiguration,
} from "./zero-trust-configuration";

const validEnvironment = {
  APP_ENV: "test",
  ZERO_TRUST_HMAC_SECRET: "0123456789abcdef0123456789abcdef",
  ZERO_TRUST_ISSUER: "https://access.huoqiu.test",
  ZERO_TRUST_MAX_SKEW_SECONDS: "300",
} as const;

const fixedNowMilliseconds = 1_800_000_000_000;
const fixedNowSeconds = fixedNowMilliseconds / 1000;
const sessionCookie = `${WEB_SESSION_COOKIE.name}=session-value`;
type NextRequestInit = NonNullable<
  ConstructorParameters<typeof NextRequest>[1]
>;

const protectedRequest = (
  pathname = "/",
  init: NextRequestInit = {},
): NextRequest =>
  new NextRequest(new URL(pathname, "https://web.huoqiu.test"), init);

type EdgeProofOptions = Readonly<{
  alphaAccess?: string | null;
  issuedAt?: string;
  issuer?: string;
  requestMethod?: string;
  signature?: string;
  signedMethod?: string;
  signedTarget?: string;
  subject?: string;
}>;

const edgeHeadersFor = (
  target: string,
  options: EdgeProofOptions = {},
): Record<string, string> => {
  const subject = options.subject ?? "employee-001";
  const issuer = options.issuer ?? validEnvironment.ZERO_TRUST_ISSUER;
  const alphaAccess =
    options.alphaAccess === undefined ? "true" : (options.alphaAccess ?? "");
  const issuedAt = options.issuedAt ?? String(fixedNowSeconds);
  const signedMethod = (
    options.signedMethod ??
    options.requestMethod ??
    "GET"
  ).toUpperCase();
  const canonical = [
    "v1",
    signedMethod,
    options.signedTarget ?? target,
    subject,
    issuer,
    alphaAccess,
    issuedAt,
  ].join("\n");
  const signature =
    options.signature ??
    `v1=${createHmac("sha256", validEnvironment.ZERO_TRUST_HMAC_SECRET)
      .update(canonical)
      .digest("hex")}`;

  const headers: Record<string, string> = {
    cookie: sessionCookie,
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": issuer,
    "x-huoqiu-edge-signature": signature,
    "x-huoqiu-edge-subject": subject,
  };
  if (options.alphaAccess !== null) {
    headers["x-huoqiu-alpha-access"] = alphaAccess;
  }
  return headers;
};

const enforce = (request: NextRequest) =>
  enforceWebBoundary(request, {
    environment: validEnvironment,
    now: () => fixedNowMilliseconds,
  });

describe("Zero Trust startup configuration", () => {
  it.each(["production", "staging"])(
    "fails closed in %s when the verifier is missing",
    (appEnvironment) => {
      expect(() =>
        assertZeroTrustStartupConfiguration({ APP_ENV: appEnvironment }),
      ).toThrowError("ZERO_TRUST_CONFIGURATION_INVALID");
    },
  );

  it("rejects invalid verifier values without echoing secret material", () => {
    const secret = "do-not-leak";
    let failure: unknown;

    try {
      loadZeroTrustConfiguration({
        ...validEnvironment,
        ZERO_TRUST_HMAC_SECRET: secret,
        ZERO_TRUST_MAX_SKEW_SECONDS: "0",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("ZERO_TRUST_CONFIGURATION_INVALID");
    expect((failure as Error).message).not.toContain(secret);
  });

  it("loads the frozen verifier protocol with the default skew", () => {
    expect(
      loadZeroTrustConfiguration({
        ZERO_TRUST_HMAC_SECRET: validEnvironment.ZERO_TRUST_HMAC_SECRET,
        ZERO_TRUST_ISSUER: validEnvironment.ZERO_TRUST_ISSUER,
      }),
    ).toEqual({
      hmacSecret: validEnvironment.ZERO_TRUST_HMAC_SECRET,
      issuer: validEnvironment.ZERO_TRUST_ISSUER,
      maxSkewSeconds: 300,
    });
  });

  it.each([
    ["short secret", { ZERO_TRUST_HMAC_SECRET: "short" }],
    ["trimmed issuer", { ZERO_TRUST_ISSUER: " issuer " }],
    ["control issuer", { ZERO_TRUST_ISSUER: "issuer\nvalue" }],
    ["Unicode control issuer", { ZERO_TRUST_ISSUER: "issuer\u0085value" }],
    ["zero skew", { ZERO_TRUST_MAX_SKEW_SECONDS: "0" }],
    ["large skew", { ZERO_TRUST_MAX_SKEW_SECONDS: "3601" }],
    ["ambiguous skew", { ZERO_TRUST_MAX_SKEW_SECONDS: "0300" }],
  ])("rejects %s verifier configuration", (_label, override) => {
    expect(() =>
      loadZeroTrustConfiguration({ ...validEnvironment, ...override }),
    ).toThrowError("ZERO_TRUST_CONFIGURATION_INVALID");
  });

  it("does not create a test or development bypass when config is absent", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("ZERO_TRUST_HMAC_SECRET", "");
    vi.stubEnv("ZERO_TRUST_ISSUER", "");
    vi.stubEnv("ZERO_TRUST_MAX_SKEW_SECONDS", "");

    const response = await middleware(protectedRequest("/watchlist"));

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Service unavailable");
  });

  it.each(["production", "staging"])(
    "wires the %s fail-closed check into Next startup configuration",
    async (appEnvironment) => {
      vi.stubEnv("APP_ENV", appEnvironment);
      vi.stubEnv("ZERO_TRUST_HMAC_SECRET", "");
      vi.stubEnv("ZERO_TRUST_ISSUER", "");
      vi.stubEnv("ZERO_TRUST_MAX_SKEW_SECONDS", "");
      vi.resetModules();

      await expect(import("../next.config")).rejects.toThrowError(
        "ZERO_TRUST_CONFIGURATION_INVALID",
      );
    },
  );
});

describe("Web Alpha boundary", () => {
  it("rejects a protected request without an edge proof before other checks", async () => {
    const response = await enforce(
      protectedRequest("/", {
        headers: {
          cookie: sessionCookie,
          "x-huoqiu-alpha-access": "true",
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("allows a protected request with an exact, current HMAC proof", async () => {
    const target = "/search?q=SYN001&sort=recent";
    const response = await enforce(
      protectedRequest(target, { headers: edgeHeadersFor(target) }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    [
      "invalid signature",
      "/search?q=SYN001",
      { signature: `v1=${"0".repeat(64)}` },
      "GET",
    ],
    [
      "tampered path",
      "/watchlist",
      { signedTarget: "/search?q=SYN001" },
      "GET",
    ],
    [
      "tampered query",
      "/search?q=SYN002",
      { signedTarget: "/search?q=SYN001" },
      "GET",
    ],
    [
      "tampered method",
      "/watchlist",
      { requestMethod: "POST", signedMethod: "GET" },
      "POST",
    ],
    [
      "unexpected issuer",
      "/watchlist",
      { issuer: "https://attacker.invalid" },
      "GET",
    ],
    [
      "Unicode control subject",
      "/watchlist",
      { subject: "employee\u0085invalid" },
      "GET",
    ],
    [
      "expired proof",
      "/watchlist",
      { issuedAt: String(fixedNowSeconds - 301) },
      "GET",
    ],
    [
      "future proof",
      "/watchlist",
      { issuedAt: String(fixedNowSeconds + 301) },
      "GET",
    ],
  ] as const)(
    "rejects an edge proof with %s",
    async (_label, target, options, method) => {
      const response = await enforce(
        protectedRequest(target, {
          headers: edgeHeadersFor(target, options),
          method,
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      await expect(response.text()).resolves.toBe("Unauthorized");
    },
  );

  it.each([undefined, "false", "TRUE", "1"])(
    "rejects alpha_access=%s after accepting the edge proof",
    async (alphaAccess) => {
      const target = "/watchlist";
      const headers = edgeHeadersFor(target, {
        alphaAccess: alphaAccess ?? null,
      });

      const response = await enforce(protectedRequest(target, { headers }));

      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Forbidden");
    },
  );

  it("rejects alpha_access changed from a signed false value to true", async () => {
    const target = "/watchlist";
    const headers = edgeHeadersFor(target, { alphaAccess: "false" });
    headers["x-huoqiu-alpha-access"] = "true";

    const response = await enforce(protectedRequest(target, { headers }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("does not evaluate alpha_access before an invalid edge proof", async () => {
    const target = "/watchlist";
    const headers = edgeHeadersFor(target, {
      signature: `v1=${"0".repeat(64)}`,
    });
    delete headers["x-huoqiu-alpha-access"];

    const response = await enforce(protectedRequest(target, { headers }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("evaluates alpha_access before the local session cookie", async () => {
    const target = "/watchlist";
    const headers = edgeHeadersFor(target, { alphaAccess: "false" });
    delete headers.cookie;

    const response = await enforce(protectedRequest(target, { headers }));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Forbidden");
  });

  it("requires the secure Web session cookie after edge and alpha checks", async () => {
    const target = "/watchlist";
    const headers = edgeHeadersFor(target);
    delete headers.cookie;

    const response = await enforce(protectedRequest(target, { headers }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it.each([
    ["empty", `${WEB_SESSION_COOKIE.name}=`],
    [
      "duplicate",
      `${WEB_SESSION_COOKIE.name}=first; ${WEB_SESSION_COOKIE.name}=second`,
    ],
    ["overlong", `${WEB_SESSION_COOKIE.name}=${"x".repeat(4097)}`],
  ])("rejects a %s Web session cookie", async (_label, cookie) => {
    const target = "/watchlist";
    const response = await enforce(
      protectedRequest(target, {
        headers: { ...edgeHeadersFor(target), cookie },
      }),
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ["a query token", "/watchlist?session_token=query-secret", {}, undefined],
    [
      "a Bearer token",
      "/watchlist",
      { authorization: "Bearer header-secret" },
      undefined,
    ],
    [
      "a body token",
      "/watchlist",
      { "content-type": "application/json" },
      JSON.stringify({ session_token: "body-secret" }),
    ],
  ] as const)(
    "does not accept %s as a Web session credential",
    async (_label, target, extraHeaders, body) => {
      const method = body === undefined ? "GET" : "POST";
      const headers: Record<string, string> = {
        ...edgeHeadersFor(target, { requestMethod: method }),
        ...extraHeaders,
      };
      delete headers.cookie;

      const response = await enforce(
        protectedRequest(target, {
          ...(body === undefined ? {} : { body }),
          headers,
          method,
        }),
      );

      expect(response.status).toBe(401);
    },
  );

  it("rejects a Bearer credential even when a session cookie is present", async () => {
    const target = "/watchlist";
    const response = await enforce(
      protectedRequest(target, {
        headers: {
          ...edgeHeadersFor(target),
          authorization: "Bearer app-only-token",
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a query credential even when a session cookie is present", async () => {
    const target = "/watchlist?access_token=query-secret";
    const response = await enforce(
      protectedRequest(target, { headers: edgeHeadersFor(target) }),
    );

    expect(response.status).toBe(401);
  });

  it("declares the exact API-issued Web cookie invariants", () => {
    expect(WEB_SESSION_COOKIE).toEqual({
      httpOnly: true,
      name: "__Secure-huoqiu.session_token",
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(WEB_SESSION_COOKIE).not.toHaveProperty("domain");
  });

  it("does not claim that an opaque cookie passed API session verification", async () => {
    const target = "/watchlist";
    const response = await enforce(
      protectedRequest(target, {
        headers: {
          ...edgeHeadersFor(target),
          cookie: `${WEB_SESSION_COOKIE.name}=opaque-unverified-value`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-huoqiu-session-verified")).toBeNull();
    expect(response.headers.get("x-huoqiu-actor-id")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["health", "/healthz", "GET"],
    ["health HEAD", "/healthz", "HEAD"],
    ["Next static", "/_next/static/chunks/app.js", "GET"],
    ["Next image", "/_next/image?url=%2Ficon.svg&w=64&q=75", "GET"],
    ["app icon", "/icon.svg", "GET"],
  ])(
    "allows the exact public %s request without credentials",
    async (_label, target, method) => {
      const response = await enforce(protectedRequest(target, { method }));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it.each([
    ["health prefix", "/healthz/private", "GET"],
    ["health query", "/healthz?verbose=true", "GET"],
    ["health POST", "/healthz", "POST"],
    ["static lookalike", "/_next/staticish/chunks/app.js", "GET"],
    ["bare static prefix", "/_next/static", "GET"],
    ["image without q", "/_next/image?url=%2Ficon.svg&w=64", "GET"],
    [
      "image duplicate url",
      "/_next/image?url=%2Ficon.svg&url=https%3A%2F%2Fevil.invalid&w=64&q=75",
      "GET",
    ],
    [
      "image extra parameter",
      "/_next/image?url=%2Ficon.svg&w=64&q=75&proxy=https%3A%2F%2Fevil.invalid",
      "GET",
    ],
    ["image POST", "/_next/image?url=%2Ficon.svg&w=64&q=75", "POST"],
    ["icon prefix", "/icon.svg/private", "GET"],
    ["unlisted favicon", "/favicon.ico", "GET"],
  ])(
    "does not broaden the public allowlist for %s",
    async (_label, target, method) => {
      const response = await enforce(protectedRequest(target, { method }));

      expect(response.status).toBe(401);
    },
  );

  it.each(["/login", "/register"])(
    "allows %s without a local session only after edge and alpha",
    async (target) => {
      const headers = edgeHeadersFor(target);
      delete headers.cookie;

      const response = await enforce(protectedRequest(target, { headers }));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("still requires edge proof and alpha_access on the login route", async () => {
    const externalResponse = await enforce(protectedRequest("/login"));
    expect(externalResponse.status).toBe(401);

    const headers = edgeHeadersFor("/login", { alphaAccess: null });
    delete headers.cookie;
    const noAlphaResponse = await enforce(
      protectedRequest("/login", { headers }),
    );
    expect(noAlphaResponse.status).toBe(403);
  });

  it.each(["/login/continue", "/register/invite"])(
    "does not extend the session exemption to %s",
    async (target) => {
      const headers = edgeHeadersFor(target);
      delete headers.cookie;

      const response = await enforce(protectedRequest(target, { headers }));

      expect(response.status).toBe(401);
    },
  );

  it("does not turn a login return target into an open redirect", async () => {
    const target = "/login?returnTo=https%3A%2F%2Fevil.invalid%2Fsteal";
    const headers = edgeHeadersFor(target);
    delete headers.cookie;

    const response = await enforce(protectedRequest(target, { headers }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("returns generic errors and never logs proof, cookie, or invite material", async () => {
    const signature = `v1=${"a".repeat(64)}`;
    const invite = "invite-super-secret";
    const cookie = "cookie-super-secret";
    const target = `/watchlist?invite_code=${invite}`;
    const logSpies = [
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];

    const response = await enforce(
      protectedRequest(target, {
        headers: {
          ...edgeHeadersFor(target, { signature }),
          cookie: `${WEB_SESSION_COOKIE.name}=${cookie}`,
        },
      }),
    );
    const responseBody = await response.text();

    expect(response.status).toBe(401);
    expect(responseBody).toBe("Unauthorized");
    expect(responseBody).not.toContain(signature);
    expect(responseBody).not.toContain(cookie);
    expect(responseBody).not.toContain(invite);
    expect(response.headers.get("location")).toBeNull();
    expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});

describe("Next 16 middleware matcher", () => {
  it.each([
    "/_next/static/chunks/app.js",
    "/_next/static/css/app.css",
    "/icon.svg",
  ])("does not invoke Proxy for the essential static asset %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config: middlewareConfig,
        nextConfig: {},
        url,
      }),
    ).toBe(false);
  });

  it.each([
    "/",
    "/healthz",
    "/_next/image?url=%2Ficon.svg&w=64&q=75",
    "/_next/staticish/chunks/app.js",
    "/_next/static",
    "/icon.svg/private",
    "/login",
    "/future-protected-page",
  ])("keeps the boundary active for %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config: middlewareConfig,
        nextConfig: {},
        url,
      }),
    ).toBe(true);
  });
});
