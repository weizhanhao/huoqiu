import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import nextConfig from "../next.config";
import * as middlewareBoundary from "./middleware";
import {
  config as middlewareConfig,
  enforceWebBoundary,
  middleware,
  WEB_SESSION_COOKIE,
} from "./middleware";
import {
  NEXT_EDGE_RESPONSE_ADAPTER_VERSION,
  NextResponse as NarrowNextResponse,
} from "./next-edge-response";
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
  body?: string | Uint8Array;
  bodyLength?: string;
  bodySha256?: string;
  contentType?: string;
  issuedAt?: string;
  issuer?: string;
  nonce?: string;
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
  const nonce = options.nonce ?? "a".repeat(32);
  const contentType = options.contentType ?? "";
  const body = options.body ?? "";
  const bodyLength =
    options.bodyLength ??
    String(
      typeof body === "string"
        ? new TextEncoder().encode(body).byteLength
        : body.byteLength,
    );
  const bodySha256 =
    options.bodySha256 ?? createHash("sha256").update(body).digest("hex");
  const signedMethod = (
    options.signedMethod ??
    options.requestMethod ??
    "GET"
  ).toUpperCase();
  const canonical = [
    "v2",
    signedMethod,
    options.signedTarget ?? target,
    subject,
    issuer,
    alphaAccess,
    issuedAt,
    nonce,
    contentType,
    bodyLength,
    bodySha256,
  ].join("\n");
  const signature =
    options.signature ??
    `v2=${createHmac("sha256", validEnvironment.ZERO_TRUST_HMAC_SECRET)
      .update(canonical)
      .digest("hex")}`;

  const headers: Record<string, string> = {
    cookie: sessionCookie,
    "x-huoqiu-edge-body-length": bodyLength,
    "x-huoqiu-edge-body-sha256": bodySha256,
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": issuer,
    "x-huoqiu-edge-nonce": nonce,
    "x-huoqiu-edge-signature": signature,
    "x-huoqiu-edge-subject": subject,
  };
  if (options.alphaAccess !== null) {
    headers["x-huoqiu-alpha-access"] = alphaAccess;
  }
  if (contentType.length > 0) headers["content-type"] = contentType;
  return headers;
};

const enforce = (request: NextRequest) =>
  enforceWebBoundary(request, {
    consumeEdgeNonce: () => true,
    environment: validEnvironment,
    now: () => fixedNowMilliseconds,
  });

describe("Zero Trust startup configuration", () => {
  it("pins the Next version used by the narrow Edge response adapter", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies: { next: string } };

    expect(packageJson.dependencies.next).toBe(
      NEXT_EDGE_RESPONSE_ADAPTER_VERSION,
    );
    expect(NarrowNextResponse.next().headers.get("x-middleware-next")).toBe(
      "1",
    );
  });

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
    [
      "issuer with internal whitespace",
      { ZERO_TRUST_ISSUER: "https://access. huoqiu.test" },
    ],
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

  it("wires NODE_ENV=production with missing APP_ENV into Next startup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("ZERO_TRUST_HMAC_SECRET", "");
    vi.stubEnv("ZERO_TRUST_ISSUER", "");
    vi.stubEnv("ZERO_TRUST_MAX_SKEW_SECONDS", "");
    vi.resetModules();

    await expect(import("../next.config")).rejects.toThrowError(
      "ZERO_TRUST_CONFIGURATION_INVALID",
    );
  });

  it("scopes NodeNext extension resolution to contracts without module aliases", () => {
    const configuration = {
      module: { rules: [] as unknown[] },
      resolve: { alias: {} },
    };

    expect(nextConfig.webpack).toBeTypeOf("function");
    const adapted = nextConfig.webpack?.(configuration as never, {} as never);
    const [contractRule] = configuration.module.rules as {
      include?: RegExp;
      resolve?: { extensionAlias?: Record<string, string[]> };
    }[];

    expect(adapted).toBe(configuration);
    expect(contractRule?.resolve?.extensionAlias).toEqual({
      ".js": [".ts", ".tsx", ".js"],
    });
    expect(
      contractRule?.include?.test(
        "/workspace/packages/contracts/src/m1/auth.schemas.ts",
      ),
    ).toBe(true);
    expect(
      contractRule?.include?.test(
        "/workspace/node_modules/next/dist/esm/api/server.js",
      ),
    ).toBe(false);
    expect(configuration.resolve.alias).toEqual({});
  });

  it("keeps production Edge artifacts free of test-only Node shims and embedded sources", () => {
    class CapturingDefinePlugin {
      constructor(readonly definitions: Readonly<Record<string, string>>) {}
    }
    const configuration = {
      devtool: "source-map",
      module: { rules: [] as unknown[] },
      plugins: [] as CapturingDefinePlugin[],
    };

    nextConfig.webpack?.(
      configuration as never,
      {
        dev: false,
        nextRuntime: "edge",
        webpack: { DefinePlugin: CapturingDefinePlugin },
      } as never,
    );

    expect(configuration.devtool).toBe("hidden-nosources-source-map");
    expect(configuration.plugins).toHaveLength(1);
    expect(configuration.plugins[0]?.definitions).toEqual({
      "process.env.NEXT_PRIVATE_TEST_PROXY": JSON.stringify("false"),
    });
  });
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

  it("keeps the 8 KB body cap everywhere except the upload path", async () => {
    /*
     * 边界要把每个请求体完整读出来、按 UTF-8 解码、再扫一遍凭证，所以
     * 请求体必须小——8 KB 就是这么来的。而帖子配图再怎么压也不止 8 KB。
     *
     * 放宽只给 /api/social/uploads 一条路径，且只放宽**体积**：完整读取、
     * 解码、扫描一样不少。全站抬高上限的话，每一条接口的边缘缓冲压力和
     * 被滥用的面都跟着变大，而那是这道上限本来要防的事。
     *
     * 两个方向都要守：上传路径放得进去，别的路径必须照旧挡住。只验前者的话，
     * 哪天有人把上限改成全局的，这条用例照样绿。
     */
    const big = JSON.stringify({ data: "A".repeat(64 * 1024) });
    const contentType = "application/json";

    const upload = "/api/social/uploads";
    const accepted = await enforce(
      protectedRequest(upload, {
        body: big,
        headers: edgeHeadersFor(upload, {
          body: big,
          contentType,
          requestMethod: "POST",
        }),
        method: "POST",
      }),
    );
    expect(accepted.status).toBe(200);

    const other = "/api/social/posts";
    const rejected = await enforce(
      protectedRequest(other, {
        body: big,
        headers: edgeHeadersFor(other, {
          body: big,
          contentType,
          requestMethod: "POST",
        }),
        method: "POST",
      }),
    );
    expect(rejected.status).toBe(401);
  });

  it("still caps the upload path so it cannot buffer without limit", async () => {
    /* 放宽不是取消：超过上传上限的请求体照样挡在边界外。 */
    const huge = JSON.stringify({ data: "A".repeat(900 * 1024) });
    const upload = "/api/social/uploads";
    const response = await enforce(
      protectedRequest(upload, {
        body: huge,
        headers: edgeHeadersFor(upload, {
          body: huge,
          contentType: "application/json",
          requestMethod: "POST",
        }),
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("binds a valid POST proof to the exact body and content type", async () => {
    const target = "/watchlist";
    const body = JSON.stringify({ note: "safe body" });
    const contentType = "application/json";
    const headers = edgeHeadersFor(target, {
      body,
      contentType,
      requestMethod: "POST",
    });

    const accepted = await enforce(
      protectedRequest(target, { body, headers, method: "POST" }),
    );
    const changedBody = await enforce(
      protectedRequest(target, {
        body: JSON.stringify({ note: "changed body" }),
        headers,
        method: "POST",
      }),
    );
    const changedContentType = await enforce(
      protectedRequest(target, {
        body,
        headers: {
          ...headers,
          "content-type": "application/json; charset=utf-8",
        },
        method: "POST",
      }),
    );

    expect(accepted.status).toBe(200);
    expect(changedBody.status).toBe(401);
    expect(changedContentType.status).toBe(401);
  });

  it("consumes a valid edge nonce only once", async () => {
    const target = "/watchlist";
    const headers = edgeHeadersFor(target, { nonce: "b".repeat(32) });
    const seen = new Set<string>();
    const consumeEdgeNonce = (key: string): boolean => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    const runtime = {
      consumeEdgeNonce,
      environment: validEnvironment,
      now: () => fixedNowMilliseconds,
    };

    const first = await enforceWebBoundary(
      protectedRequest(target, { headers }),
      runtime,
    );
    const replay = await enforceWebBoundary(
      protectedRequest(target, { headers }),
      runtime,
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(seen.size).toBe(1);
  });

  it("provides a bounded nonce guard that rejects replay and fails closed at capacity", () => {
    const factory = (
      middlewareBoundary as unknown as {
        createEdgeNonceGuard?: (
          capacity: number,
        ) => (key: string, expiresAt: number, now: number) => boolean;
      }
    ).createEdgeNonceGuard;

    expect(factory).toBeTypeOf("function");
    if (factory === undefined) return;
    const guard = factory(1);

    expect(guard("issuer:subject:nonce-a", 2_000, 1_000)).toBe(true);
    expect(guard("issuer:subject:nonce-a", 2_000, 1_001)).toBe(false);
    expect(guard("issuer:subject:nonce-b", 2_000, 1_001)).toBe(false);
    expect(guard("issuer:subject:nonce-b", 3_000, 2_000)).toBe(true);
  });

  it("rejects a correctly signed subject containing internal whitespace", async () => {
    const target = "/watchlist";
    const response = await enforce(
      protectedRequest(target, {
        headers: edgeHeadersFor(target, { subject: "employee 001" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ["x-huoqiu-edge-subject", ["employee-001", "employee-002"]],
    [
      "x-huoqiu-edge-issuer",
      [validEnvironment.ZERO_TRUST_ISSUER, "https://second.invalid"],
    ],
    ["x-huoqiu-alpha-access", ["true", "true"]],
    [
      "x-huoqiu-edge-issued-at",
      [String(fixedNowSeconds), String(fixedNowSeconds)],
    ],
    ["x-huoqiu-edge-signature", ["placeholder", "placeholder"]],
  ] as const)(
    "rejects duplicate %s values after Headers collapse",
    async (headerName, values) => {
      const target = "/watchlist";
      const combined = values.join(", ");
      const options: EdgeProofOptions =
        headerName === "x-huoqiu-edge-subject"
          ? { subject: combined }
          : headerName === "x-huoqiu-edge-issuer"
            ? { issuer: combined }
            : headerName === "x-huoqiu-alpha-access"
              ? { alphaAccess: combined }
              : headerName === "x-huoqiu-edge-issued-at"
                ? { issuedAt: combined }
                : {};
      const headers = new Headers(edgeHeadersFor(target, options));
      const validSignature = headers.get("x-huoqiu-edge-signature");
      headers.delete(headerName);
      for (const value of values) headers.append(headerName, value);
      if (headerName === "x-huoqiu-edge-signature" && validSignature !== null) {
        headers.delete(headerName);
        headers.append(headerName, validSignature);
        headers.append(headerName, validSignature);
      }

      expect(headers.get(headerName)).toBe(
        headerName === "x-huoqiu-edge-signature"
          ? `${validSignature}, ${validSignature}`
          : combined,
      );
      const response = await enforce(protectedRequest(target, { headers }));

      expect(response.status).toBe(401);
    },
  );

  it.each([
    [
      "invalid signature",
      "/search?q=SYN001",
      { signature: `v2=${"0".repeat(64)}` },
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
      signature: `v2=${"0".repeat(64)}`,
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
        ...edgeHeadersFor(target, {
          ...(body === undefined
            ? {}
            : { body, contentType: "application/json" }),
          requestMethod: method,
        }),
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

  it.each([
    ["uppercase access token", "/watchlist?ACCESS_TOKEN=query-secret"],
    ["session token", "/watchlist?session-token=query-secret"],
    ["refresh token", "/watchlist?refreshToken=query-secret"],
    ["ID token", "/watchlist?ID%5FToken=query-secret"],
    ["authorization", "/watchlist?authorization=query-secret"],
    ["Bearer", "/watchlist?Bearer=query-secret"],
    ["generic token", "/watchlist?token=query-secret"],
    ["invite", "/watchlist?return_invite=query-secret"],
    ["single-encoded key", "/watchlist?%61ccess_token=query-secret"],
    ["double-encoded key", "/watchlist?%2561ccess_token=query-secret"],
    ["multi-encoded key", "/watchlist?%252561ccess_token=query-secret"],
    [
      "still-encoded key after the decode bound",
      "/watchlist?%25252525252561ccess_token=query-secret",
    ],
    ["malformed encoded key", "/watchlist?%ZZ=query-secret"],
  ])(
    "rejects a valid Cookie request carrying a %s query credential",
    async (_label, target) => {
      const request = protectedRequest(target, {
        headers: edgeHeadersFor(target),
      });
      expect(`${request.nextUrl.pathname}${request.nextUrl.search}`).toBe(
        target,
      );

      const response = await enforce(request);

      expect(response.status).toBe(401);
    },
  );

  it("allows a signed non-credential query on a protected route", async () => {
    const target = "/watchlist?page=1";
    const response = await enforce(
      protectedRequest(target, { headers: edgeHeadersFor(target) }),
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ["credential key", "/watchlist?credential=query-secret"],
    ["credentials key", "/watchlist?credentials=query-secret"],
    ["reviewer raw semicolon carrier", "/watchlist?page=1;access_token=x"],
    [
      "reviewer encoded semicolon carrier",
      "/watchlist?page=1%3Baccess_token=x",
    ],
    ["encoded nested pair", "/watchlist?page=1%26credential%3Dquery-secret"],
    [
      "double-encoded nested pair",
      "/watchlist?page=1%2526credentials%253Dquery-secret",
    ],
    [
      "encoded semicolon carrier",
      "/watchlist?page=1%3Bcredential%3Dquery-secret",
    ],
    ["encoded nested equals", "/watchlist?page=1%3Dcredential%3Dquery-secret"],
    ["malformed encoded value", "/watchlist?page=%ZZ"],
    ["reviewer residual percent value", "/watchlist?page=%25"],
    [
      "still-encoded value after the decode bound",
      "/watchlist?page=%25252525252531",
    ],
  ])(
    "rejects a valid Cookie request carrying a %s in the full query sequence",
    async (_label, target) => {
      const request = protectedRequest(target, {
        headers: edgeHeadersFor(target),
      });
      expect(`${request.nextUrl.pathname}${request.nextUrl.search}`).toBe(
        target,
      );

      const response = await enforce(request);

      expect(response.status).toBe(401);
    },
  );

  it.each([
    [
      "JSON credential field",
      "application/json",
      JSON.stringify({ session_token: "body-secret" }),
    ],
    [
      "nested Bearer value",
      "application/json; charset=utf-8",
      JSON.stringify({ payload: { value: "Bearer body-secret" } }),
    ],
    [
      "form-encoded Bearer value",
      "application/x-www-form-urlencoded",
      "note=Bearer+body-secret",
    ],
    [
      "form credential field",
      "application/x-www-form-urlencoded",
      "session_token=body-secret",
    ],
    [
      "refresh token field",
      "application/json",
      JSON.stringify({ refreshToken: "body-secret" }),
    ],
    [
      "ID token field",
      "application/json",
      JSON.stringify({ ID_TOKEN: "body-secret" }),
    ],
    [
      "invite credential field",
      "application/x-www-form-urlencoded",
      "return_invite=body-secret",
    ],
    [
      "double-encoded credential field",
      "application/x-www-form-urlencoded",
      "%2561ccess_token=body-secret",
    ],
    [
      "JSON credential field alias",
      "application/json",
      JSON.stringify({ credential: "body-secret" }),
    ],
    [
      "JSON credentials field alias",
      "application/json",
      JSON.stringify({ credentials: "body-secret" }),
    ],
    [
      "encoded nested form credential",
      "application/x-www-form-urlencoded",
      "note=ok%26credential%3Dbody-secret",
    ],
  ])(
    "rejects a Cookie request carrying a %s",
    async (_label, contentType, body) => {
      const target = "/watchlist";
      const request = protectedRequest(target, {
        body,
        headers: {
          ...edgeHeadersFor(target, {
            body,
            contentType,
            requestMethod: "POST",
          }),
          "content-type": contentType,
        },
        method: "POST",
      });

      const response = await enforce(request);

      expect(response.status).toBe(401);
      expect(request.bodyUsed).toBe(false);
      await expect(request.text()).resolves.toBe(body);
    },
  );

  it("allows only the exact M1 register JSON contract with invite_code", async () => {
    const target = "/register";
    const body = JSON.stringify({
      display_name: "Alpha User",
      email: "alpha@example.test",
      invite_code: "invite-code-1234",
      password: "correct-horse-battery-staple",
    });
    const headers: Record<string, string> = {
      ...edgeHeadersFor(target, {
        body,
        contentType: "application/json",
        requestMethod: "POST",
      }),
      "content-type": "application/json",
    };
    delete headers.cookie;
    const request = protectedRequest(target, { body, headers, method: "POST" });

    const response = await enforce(request);

    expect(response.status).toBe(200);
    expect(request.bodyUsed).toBe(false);
    await expect(request.text()).resolves.toBe(body);
  });

  it.each([
    [
      "an extra field",
      "/register",
      {
        display_name: "Alpha User",
        email: "alpha@example.test",
        extra: "not-in-contract",
        invite_code: "invite-code-1234",
        password: "correct-horse-battery-staple",
      },
    ],
    [
      "a credential alias",
      "/register",
      {
        credential: "not-allowed",
        display_name: "Alpha User",
        email: "alpha@example.test",
        invite_code: "invite-code-1234",
        password: "correct-horse-battery-staple",
      },
    ],
    [
      "an extra login field",
      "/login",
      {
        email: "alpha@example.test",
        extra: "not-in-contract",
        password: "correct-horse-battery-staple",
        transport: "cookie",
      },
    ],
    [
      "Bearer transport",
      "/login",
      {
        email: "alpha@example.test",
        password: "correct-horse-battery-staple",
        transport: "bearer",
      },
    ],
  ] as const)(
    "rejects %s on the Web auth body boundary",
    async (_label, target, payload) => {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        ...edgeHeadersFor(target, {
          body,
          contentType: "application/json",
          requestMethod: "POST",
        }),
        "content-type": "application/json",
      };
      delete headers.cookie;

      const response = await enforce(
        protectedRequest(target, { body, headers, method: "POST" }),
      );

      expect(response.status).toBe(401);
    },
  );

  it("allows the exact M1 cookie-login JSON contract", async () => {
    const target = "/login";
    const body = JSON.stringify({
      email: "alpha@example.test",
      password: "correct-horse-battery-staple",
      transport: "cookie",
    });
    const headers: Record<string, string> = {
      ...edgeHeadersFor(target, {
        body,
        contentType: "application/json",
        requestMethod: "POST",
      }),
      "content-type": "application/json",
    };
    delete headers.cookie;

    const response = await enforce(
      protectedRequest(target, { body, headers, method: "POST" }),
    );

    expect(response.status).toBe(200);
  });

  it.each(["/login", "/register"])(
    "rejects a bodyless POST to %s",
    async (target) => {
      const headers = edgeHeadersFor(target, { requestMethod: "POST" });
      delete headers.cookie;

      const response = await enforce(
        protectedRequest(target, { headers, method: "POST" }),
      );

      expect(response.status).toBe(401);
    },
  );

  it.each([
    ["malformed JSON", "{", "application/json"],
    [
      "malformed form encoding",
      "note=%ZZ",
      "application/x-www-form-urlencoded",
    ],
    [
      "encoded semicolon form carrier",
      "note=ok%3Bcredential%3Dbody-secret",
      "application/x-www-form-urlencoded",
    ],
    ["unsupported content type", "safe text", "text/plain"],
    [
      "oversized JSON",
      JSON.stringify({ payload: "x".repeat(9_000) }),
      "application/json",
    ],
  ])(
    "fails closed for %s and aborts the original handler body",
    async (_label, body, contentType) => {
      const target = "/watchlist";
      const request = protectedRequest(target, {
        body,
        headers: {
          ...edgeHeadersFor(target, {
            body,
            contentType,
            requestMethod: "POST",
          }),
          "content-type": contentType,
        },
        method: "POST",
      });

      const response = await enforce(request);

      expect(response.status).toBe(401);
      expect(request.bodyUsed).toBe(true);
      await expect(request.text()).rejects.toThrow();
    },
  );

  it("fails closed for invalid UTF-8 and aborts the original handler body", async () => {
    const target = "/watchlist";
    const body = new Uint8Array([0xc3, 0x28]);
    const request = protectedRequest(target, {
      body,
      headers: {
        ...edgeHeadersFor(target, {
          body,
          contentType: "application/json",
          requestMethod: "POST",
        }),
        "content-type": "application/json",
      },
      method: "POST",
    });

    const response = await enforce(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(true);
    await expect(request.arrayBuffer()).rejects.toThrow();
  });

  it("fails closed on an unfinished body without waiting forever", async () => {
    const target = "/watchlist";
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        streamController.enqueue(new TextEncoder().encode("{"));
      },
    });
    const request = protectedRequest(target, {
      body,
      duplex: "half",
      headers: {
        ...edgeHeadersFor(target, {
          body: "{",
          contentType: "application/json",
          requestMethod: "POST",
        }),
        "content-type": "application/json",
      },
      method: "POST",
    } as NextRequestInit);

    vi.useFakeTimers();
    const responsePromise = enforce(request);
    let settled = false;
    void responsePromise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_001);
    const settledBeforeSourceClosed = settled;
    const response = await responsePromise;
    const originalBodyWasAborted = request.bodyUsed;
    if (!originalBodyWasAborted) {
      controller.close();
      await request.body?.cancel();
    }
    vi.useRealTimers();

    expect(settledBeforeSourceClosed).toBe(true);
    expect(response.status).toBe(401);
    expect(originalBodyWasAborted).toBe(true);
  });

  it("preserves a safe bounded JSON body for the protected handler", async () => {
    const target = "/watchlist";
    const body = JSON.stringify({ note: "safe body" });
    const request = protectedRequest(target, {
      body,
      headers: {
        ...edgeHeadersFor(target, {
          body,
          contentType: "application/json",
          requestMethod: "POST",
        }),
        "content-type": "application/json",
      },
      method: "POST",
    });

    const response = await enforce(request);

    expect(response.status).toBe(200);
    expect(request.bodyUsed).toBe(false);
    await expect(request.text()).resolves.toBe(body);
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
    ["health", "/healthz"],
    ["Next static", "/_next/static/chunks/app.js"],
    ["app icon", "/icon.svg"],
  ])(
    "rejects an Authorization credential on the public %s route",
    async (_label, target) => {
      const response = await enforce(
        protectedRequest(target, {
          headers: { authorization: "Bearer must-not-bypass" },
        }),
      );

      expect(response.status).toBe(401);
    },
  );

  it.each([
    "/_next/static/chunks/app.js?access_token=must-not-bypass",
    "/_next/static/chunks/app.js?session_token=must-not-bypass",
    "/icon.svg?access_token=must-not-bypass",
    "/icon.svg?session_token=must-not-bypass",
    "/_next/static/chunks/app.js?v=1",
    "/icon.svg?v=1",
  ])(
    "requires an exact query-free public asset request for %s",
    async (target) => {
      const response = await enforce(protectedRequest(target));

      expect(response.status).toBe(401);
    },
  );

  it.each(["/_next/static/chunks/app.js", "/icon.svg"])(
    "does not mistake an ordinary Cookie header for a credential on %s",
    async (target) => {
      const response = await enforce(
        protectedRequest(target, { headers: { cookie: "theme=dark" } }),
      );

      expect(response.status).toBe(200);
    },
  );

  it.each([
    ["health prefix", "/healthz/private", "GET"],
    ["health query", "/healthz?verbose=true", "GET"],
    ["health POST", "/healthz", "POST"],
    ["static lookalike", "/_next/staticish/chunks/app.js", "GET"],
    ["bare static prefix", "/_next/static", "GET"],
    [
      "unused Next image optimizer",
      "/_next/image?url=%2Ficon.svg&w=64&q=75",
      "GET",
    ],
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

  it.each([
    "/_next/static/chunks/%252e%252e%252fsecret.js",
    "/_next/static/chunks/%25252e%25252e%25252fsecret.js",
    "/_next/static/chunks/%252fsecret.js",
    "/_next/static/chunks/%255c..%255csecret.js",
    "/_next/static/chunks/%25still-encoded.js",
    "/_next/static//chunks/app.js",
  ])(
    "rejects an encoded or ambiguous public static path %s",
    async (target) => {
      const response = await enforce(protectedRequest(target));

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
    const signature = `v2=${"a".repeat(64)}`;
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
  ])("keeps middleware active for the public static asset %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config: middlewareConfig,
        nextConfig: {},
        url,
      }),
    ).toBe(true);
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
