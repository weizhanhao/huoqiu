import { createHmac } from "node:crypto";

import { type ExecutionContext, HttpException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import {
  AlphaAccessGuard,
  assertZeroTrustConfiguration,
  type ZeroTrustConfiguration,
} from "../../src/identity/alpha-access.guard.js";
import { createHttpApp } from "../../src/main.js";

const secret = "alpha-edge-test-secret-with-at-least-32-characters";
const issuer = "huoqiu-test-edge";
const nowSeconds = 1_786_294_800;

type GuardRequest = Readonly<{
  headers: Readonly<Record<string, string | undefined>>;
  method: string;
  url: string;
}>;

const configuration: ZeroTrustConfiguration = {
  issuer,
  maxClockSkewSeconds: 300,
  secret,
};

const signedHeaders = (
  request: Pick<GuardRequest, "method" | "url">,
  overrides: Readonly<{
    alphaAccess?: string;
    issuedAt?: string;
    requestIssuer?: string;
    subject?: string;
  }> = {},
): Record<string, string> => {
  const alphaAccess = overrides.alphaAccess ?? "true";
  const issuedAt = overrides.issuedAt ?? String(nowSeconds);
  const requestIssuer = overrides.requestIssuer ?? issuer;
  const subject = overrides.subject ?? "employee-001";
  const canonical = [
    "v1",
    request.method.toUpperCase(),
    request.url,
    subject,
    requestIssuer,
    alphaAccess,
    issuedAt,
  ].join("\n");
  const signature = createHmac("sha256", secret)
    .update(canonical)
    .digest("hex");

  return {
    "x-huoqiu-alpha-access": alphaAccess,
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": requestIssuer,
    "x-huoqiu-edge-signature": `v1=${signature}`,
    "x-huoqiu-edge-subject": subject,
  };
};

const executionContext = (request: GuardRequest): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

const rejectionStatus = (action: () => unknown): number | undefined => {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : undefined;
  }
};

describe("AlphaAccessGuard", () => {
  it("accepts a fresh request only when its edge proof and alpha_access claim are valid", () => {
    const request = { method: "POST", url: "/v1/auth/login" };
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);

    expect(
      guard.canActivate(
        executionContext({ ...request, headers: signedHeaders(request) }),
      ),
    ).toBe(true);
  });

  it.each([
    ["missing proof", {}],
    [
      "tampered signature",
      {
        ...signedHeaders({ method: "POST", url: "/v1/auth/login" }),
        "x-huoqiu-edge-signature": `v1=${"0".repeat(64)}`,
      },
    ],
    [
      "missing alpha_access",
      signedHeaders(
        { method: "POST", url: "/v1/auth/login" },
        { alphaAccess: "false" },
      ),
    ],
    [
      "stale proof",
      signedHeaders(
        { method: "POST", url: "/v1/auth/login" },
        { issuedAt: String(nowSeconds - 301) },
      ),
    ],
  ])("rejects %s before the request reaches a controller", (_name, headers) => {
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);

    expect(() =>
      guard.canActivate(
        executionContext({
          headers,
          method: "POST",
          url: "/v1/auth/login",
        }),
      ),
    ).toThrow();
  });

  it("binds the signature to the method and request target", () => {
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);
    const headers = signedHeaders({ method: "POST", url: "/v1/auth/login" });

    expect(() =>
      guard.canActivate(
        executionContext({
          headers,
          method: "GET",
          url: "/v1/auth/session",
        }),
      ),
    ).toThrow();
  });

  it("verifies the raw alpha value before enforcing the alpha_access claim", () => {
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);
    const request = { method: "POST", url: "/v1/auth/login" };
    const signedFalse = signedHeaders(request, { alphaAccess: "false" });

    expect(
      rejectionStatus(() =>
        guard.canActivate(
          executionContext({ headers: signedFalse, ...request }),
        ),
      ),
    ).toBe(403);
    expect(
      rejectionStatus(() =>
        guard.canActivate(
          executionContext({
            headers: { ...signedFalse, "x-huoqiu-alpha-access": "true" },
            ...request,
          }),
        ),
      ),
    ).toBe(401);
  });

  it.each([
    ["collapsed subject", { subject: "employee-001, employee-001" }],
    ["subject with internal whitespace", { subject: "employee 001" }],
    ["collapsed alpha_access", { alphaAccess: "true, true" }],
    ["alpha_access with internal whitespace", { alphaAccess: "tr ue" }],
    [
      "collapsed issued-at",
      { issuedAt: `${String(nowSeconds)}, ${String(nowSeconds)}` },
    ],
  ])("rejects a correctly signed malformed %s scalar", (_name, overrides) => {
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);
    const request = { method: "POST", url: "/v1/auth/login" };

    expect(
      rejectionStatus(() =>
        guard.canActivate(
          executionContext({
            ...request,
            headers: signedHeaders(request, overrides),
          }),
        ),
      ),
    ).toBe(401);
  });

  it("rejects a correctly signed folded issuer even if configuration repeats it", () => {
    const foldedIssuer = `${issuer}, ${issuer}`;
    const guard = new AlphaAccessGuard(
      { ...configuration, issuer: foldedIssuer },
      () => nowSeconds,
    );
    const request = { method: "POST", url: "/v1/auth/login" };

    expect(
      rejectionStatus(() =>
        guard.canActivate(
          executionContext({
            ...request,
            headers: signedHeaders(request, {
              requestIssuer: foldedIssuer,
            }),
          }),
        ),
      ),
    ).toBe(401);
  });

  it("rejects a folded signature scalar", () => {
    const guard = new AlphaAccessGuard(configuration, () => nowSeconds);
    const request = { method: "POST", url: "/v1/auth/login" };
    const headers = signedHeaders(request);
    const signature = headers["x-huoqiu-edge-signature"];

    expect(
      rejectionStatus(() =>
        guard.canActivate(
          executionContext({
            ...request,
            headers: {
              ...headers,
              "x-huoqiu-edge-signature": `${String(signature)}, ${String(signature)}`,
            },
          }),
        ),
      ),
    ).toBe(401);
  });

  it.each([
    ["POST", "/healthz"],
    ["GET", "/healthz?private=true"],
    ["GET", "/healthz/private"],
  ])("does not bypass edge proof for %s %s", (method, url) => {
    const guard = new AlphaAccessGuard(undefined, () => nowSeconds);
    expect(
      rejectionStatus(() =>
        guard.canActivate(executionContext({ headers: {}, method, url })),
      ),
    ).toBe(401);
  });

  it.each(["GET", "HEAD"])(
    "allows the exact public %s /healthz probe without edge proof",
    (method) => {
      const guard = new AlphaAccessGuard(undefined, () => nowSeconds);
      expect(
        guard.canActivate(
          executionContext({ headers: {}, method, url: "/healthz" }),
        ),
      ).toBe(true);
    },
  );
});

describe("Zero Trust startup configuration", () => {
  it.each(["production", "staging"])(
    "fails closed in %s before an HTTP listener can start",
    (appEnvironment) => {
      expect(() =>
        assertZeroTrustConfiguration({ APP_ENV: appEnvironment }),
      ).toThrow("ZERO_TRUST_CONFIGURATION_MISSING");
    },
  );

  it("does not ship a test-secret fallback into secured environments", () => {
    expect(() =>
      assertZeroTrustConfiguration({
        APP_ENV: "production",
        ZERO_TRUST_HMAC_SECRET: "test",
        ZERO_TRUST_ISSUER: issuer,
      }),
    ).toThrow("ZERO_TRUST_CONFIGURATION_INVALID");
  });

  it.each(["huoqiu edge", "huoqiu-edge, huoqiu-edge"])(
    "rejects a non-scalar configured issuer: %s",
    (configuredIssuer) => {
      expect(() =>
        assertZeroTrustConfiguration({
          APP_ENV: "production",
          ZERO_TRUST_HMAC_SECRET: secret,
          ZERO_TRUST_ISSUER: configuredIssuer,
        }),
      ).toThrow("ZERO_TRUST_CONFIGURATION_INVALID");
    },
  );

  it("rejects secured startup before NestFactory.create is called", async () => {
    const previous = {
      appEnvironment: process.env.APP_ENV,
      issuer: process.env.ZERO_TRUST_ISSUER,
      secret: process.env.ZERO_TRUST_HMAC_SECRET,
    };
    process.env.APP_ENV = "production";
    delete process.env.ZERO_TRUST_HMAC_SECRET;
    delete process.env.ZERO_TRUST_ISSUER;
    const create = vi.spyOn(NestFactory, "create");

    try {
      await expect(createHttpApp()).rejects.toThrow(
        "ZERO_TRUST_CONFIGURATION_MISSING",
      );
      expect(create).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
      if (previous.appEnvironment === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previous.appEnvironment;
      if (previous.issuer === undefined) delete process.env.ZERO_TRUST_ISSUER;
      else process.env.ZERO_TRUST_ISSUER = previous.issuer;
      if (previous.secret === undefined)
        delete process.env.ZERO_TRUST_HMAC_SECRET;
      else process.env.ZERO_TRUST_HMAC_SECRET = previous.secret;
    }
  });

  it("rejects process-local identity persistence before NestFactory.create is called", async () => {
    const previous = {
      appEnvironment: process.env.APP_ENV,
      authSecret: process.env.BETTER_AUTH_SECRET,
      issuer: process.env.ZERO_TRUST_ISSUER,
      secret: process.env.ZERO_TRUST_HMAC_SECRET,
    };
    process.env.APP_ENV = "production";
    process.env.BETTER_AUTH_SECRET =
      "production-auth-secret-with-at-least-thirty-two-characters";
    process.env.ZERO_TRUST_HMAC_SECRET = secret;
    process.env.ZERO_TRUST_ISSUER = issuer;
    const create = vi.spyOn(NestFactory, "create");

    try {
      await expect(createHttpApp()).rejects.toThrow(
        "AUTH_PROVIDER_PERSISTENCE_NOT_CONFIGURED",
      );
      expect(create).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
      if (previous.appEnvironment === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previous.appEnvironment;
      if (previous.authSecret === undefined)
        delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previous.authSecret;
      if (previous.issuer === undefined) delete process.env.ZERO_TRUST_ISSUER;
      else process.env.ZERO_TRUST_ISSUER = previous.issuer;
      if (previous.secret === undefined)
        delete process.env.ZERO_TRUST_HMAC_SECRET;
      else process.env.ZERO_TRUST_HMAC_SECRET = previous.secret;
    }
  });
});
