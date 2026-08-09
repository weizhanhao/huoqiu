import { NextResponse, type NextRequest } from "next/server";

const ADMIN_BASE_PATH = "/admin";
const CONFIGURATION_ERROR = "ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED";
const DEFAULT_MAX_SKEW_SECONDS = 300;
const MAX_CONFIGURED_SKEW_SECONDS = 3600;
const MINIMUM_SECRET_BYTES = 32;

const EDGE_HEADERS = Object.freeze({
  alphaAccess: "x-huoqiu-alpha-access",
  issuedAt: "x-huoqiu-edge-issued-at",
  issuer: "x-huoqiu-edge-issuer",
  signature: "x-huoqiu-edge-signature",
  subject: "x-huoqiu-edge-subject",
});

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "authorization",
  "bearer",
  "invite",
  "invite_code",
  "session",
  "session_token",
  "token",
]);

const UNTRUSTED_AUTHORIZATION_HEADERS = [
  "x-huoqiu-action-authorized",
  "x-huoqiu-admin-role",
  "x-huoqiu-admin-roles",
  "x-huoqiu-authenticated-role",
  "x-huoqiu-authenticated-roles",
  "x-huoqiu-ownership-authorized",
  "x-huoqiu-session-valid",
] as const;

const APP_ENVIRONMENTS = new Set([
  "development",
  "production",
  "staging",
  "test",
]);

export const ADMIN_SESSION_TRANSPORT = "cookie" as const;

export const ADMIN_SESSION_COOKIE = Object.freeze({
  httpOnly: true,
  name: "__Secure-huoqiu.session_token",
  path: "/",
  sameSite: "lax" as const,
  secure: true,
});

export type AdminAccessConfig = Readonly<{
  appEnvironment: string;
  issuer: string;
  maxSkewSeconds: number;
  secret: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

type EvaluationOptions = Readonly<{
  now?: () => number;
}>;

type AdminAccessDecision =
  | Readonly<{
      kind: "allow";
      nextAuthorization: "api_session_role_action_ownership" | "none";
      scope: "allowlist" | "protected";
    }>
  | Readonly<{
      checkpoint: "alpha_access" | "edge_proof" | "session";
      kind: "deny";
    }>;

const configurationError = (): Error => new Error(CONFIGURATION_ERROR);

const hasForbiddenCharactersOrWhitespace = (value: string): boolean => {
  if (value.trim() !== value) {
    return true;
  }

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return true;
    }
  }

  return false;
};

const parseMaxSkewSeconds = (rawValue: string | undefined): number => {
  if (rawValue === undefined || rawValue === "") {
    return DEFAULT_MAX_SKEW_SECONDS;
  }

  if (!/^(0|[1-9]\d*)$/u.test(rawValue)) {
    throw configurationError();
  }

  const parsed = Number(rawValue);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CONFIGURED_SKEW_SECONDS
  ) {
    throw configurationError();
  }

  return parsed;
};

export const loadAdminAccessConfig = (
  environment: Environment,
): AdminAccessConfig => {
  const appEnvironment = environment.APP_ENV;
  const issuer = environment.ZERO_TRUST_ISSUER;
  const secret = environment.ZERO_TRUST_HMAC_SECRET;

  if (
    appEnvironment === undefined ||
    !APP_ENVIRONMENTS.has(appEnvironment) ||
    issuer === undefined ||
    issuer.length === 0 ||
    issuer.length > 256 ||
    hasForbiddenCharactersOrWhitespace(issuer) ||
    secret === undefined ||
    new TextEncoder().encode(secret).byteLength < MINIMUM_SECRET_BYTES
  ) {
    throw configurationError();
  }

  return Object.freeze({
    appEnvironment,
    issuer,
    maxSkewSeconds: parseMaxSkewSeconds(
      environment.ZERO_TRUST_MAX_SKEW_SECONDS,
    ),
    secret,
  });
};

const routePath = (requestUrl: URL): string => {
  if (requestUrl.pathname === ADMIN_BASE_PATH) {
    return "/";
  }

  if (requestUrl.pathname.startsWith(`${ADMIN_BASE_PATH}/`)) {
    return requestUrl.pathname.slice(ADMIN_BASE_PATH.length);
  }

  return requestUrl.pathname;
};

const hasSafeStaticSegments = (path: string): boolean => {
  const remainder = path.slice("/_next/static/".length);
  if (remainder.length === 0) {
    return false;
  }

  return remainder.split("/").every((segment) => {
    if (segment.length === 0) {
      return false;
    }

    try {
      const decoded = decodeURIComponent(segment);
      return (
        decoded !== "." &&
        decoded !== ".." &&
        !hasForbiddenCharactersOrWhitespace(decoded) &&
        !decoded.includes("/") &&
        !decoded.includes("\\") &&
        !decoded.includes("\0")
      );
    } catch {
      return false;
    }
  });
};

const hasSensitiveCredentialQuery = (requestUrl: URL): boolean => {
  for (const key of requestUrl.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      return true;
    }
  }

  return false;
};

const isPublicAllowlistRequest = (
  request: NextRequest,
  requestUrl: URL,
): boolean => {
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    hasSensitiveCredentialQuery(requestUrl)
  ) {
    return false;
  }

  const path = routePath(requestUrl);
  return (
    path === "/healthz" ||
    (path.startsWith("/_next/static/") && hasSafeStaticSegments(path))
  );
};

const parseCanonicalUnixSeconds = (rawValue: string): number | undefined => {
  if (!/^(0|[1-9]\d*)$/u.test(rawValue)) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const decodeSignature = (
  signature: string,
): Uint8Array<ArrayBuffer> | undefined => {
  if (!/^v1=[0-9a-f]{64}$/u.test(signature)) {
    return undefined;
  }

  const hexadecimal = signature.slice(3);
  const bytes = new Uint8Array(new ArrayBuffer(32));
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(
      hexadecimal.slice(index * 2, index * 2 + 2),
      16,
    );
    bytes[index] = byte;
  }

  return bytes;
};

const verifyEdgeProof = async (
  request: NextRequest,
  requestUrl: URL,
  accessConfig: AdminAccessConfig,
  now: () => number,
): Promise<boolean> => {
  const subject = request.headers.get(EDGE_HEADERS.subject);
  const issuer = request.headers.get(EDGE_HEADERS.issuer);
  const alphaAccess = request.headers.get(EDGE_HEADERS.alphaAccess) ?? "";
  const rawIssuedAt = request.headers.get(EDGE_HEADERS.issuedAt);
  const rawSignature = request.headers.get(EDGE_HEADERS.signature);

  if (
    subject === null ||
    subject.length === 0 ||
    subject.length > 256 ||
    hasForbiddenCharactersOrWhitespace(subject) ||
    issuer === null ||
    issuer.length === 0 ||
    issuer.length > 256 ||
    hasForbiddenCharactersOrWhitespace(issuer) ||
    issuer !== accessConfig.issuer ||
    rawIssuedAt === null ||
    rawSignature === null
  ) {
    return false;
  }

  const issuedAt = parseCanonicalUnixSeconds(rawIssuedAt);
  const signature = decodeSignature(rawSignature);
  const nowSeconds = Math.floor(now() / 1000);
  if (
    issuedAt === undefined ||
    signature === undefined ||
    !Number.isSafeInteger(nowSeconds) ||
    Math.abs(nowSeconds - issuedAt) > accessConfig.maxSkewSeconds
  ) {
    return false;
  }

  const canonical = [
    "v1",
    request.method.toUpperCase(),
    `${requestUrl.pathname}${requestUrl.search}`,
    subject,
    issuer,
    alphaAccess,
    rawIssuedAt,
  ].join("\n");
  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(accessConfig.secret),
      { hash: "SHA-256", name: "HMAC" },
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(canonical),
    );
  } catch {
    return false;
  }
};

type SessionCookieState = "invalid" | "missing" | "present";

const readSessionCookieState = (request: NextRequest): SessionCookieState => {
  const rawCookie = request.headers.get("cookie");
  if (rawCookie === null || rawCookie.length === 0) {
    return "missing";
  }

  const sessionValues: string[] = [];
  for (const rawSegment of rawCookie.split(";")) {
    const separatorIndex = rawSegment.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const name = rawSegment.slice(0, separatorIndex).trim();
    if (name === ADMIN_SESSION_COOKIE.name) {
      sessionValues.push(rawSegment.slice(separatorIndex + 1).trim());
    }
  }

  if (sessionValues.length === 0) {
    return "missing";
  }

  if (
    sessionValues.length !== 1 ||
    sessionValues[0]?.length === 0 ||
    (sessionValues[0]?.length ?? 0) > 4096
  ) {
    return "invalid";
  }

  return "present";
};

export const evaluateAdminAccess = async (
  request: NextRequest,
  accessConfig: AdminAccessConfig,
  options: EvaluationOptions = {},
): Promise<AdminAccessDecision> => {
  const requestUrl = new URL(request.url);

  if (isPublicAllowlistRequest(request, requestUrl)) {
    return { kind: "allow", nextAuthorization: "none", scope: "allowlist" };
  }

  const edgeProofIsValid = await verifyEdgeProof(
    request,
    requestUrl,
    accessConfig,
    options.now ?? Date.now,
  );
  if (!edgeProofIsValid) {
    return {
      checkpoint: "edge_proof",
      kind: "deny",
    };
  }

  if (request.headers.get(EDGE_HEADERS.alphaAccess) !== "true") {
    return {
      checkpoint: "alpha_access",
      kind: "deny",
    };
  }

  if (hasSensitiveCredentialQuery(requestUrl)) {
    return {
      checkpoint: "session",
      kind: "deny",
    };
  }

  if (request.headers.has("authorization")) {
    return {
      checkpoint: "session",
      kind: "deny",
    };
  }

  const sessionCookieState = readSessionCookieState(request);
  if (sessionCookieState !== "present") {
    return {
      checkpoint: "session",
      kind: "deny",
    };
  }

  // Cookie presence is only a routing precondition. Better Auth session validity,
  // roles, action, and ownership remain mandatory API authorization checks.
  return {
    kind: "allow",
    nextAuthorization: "api_session_role_action_ownership",
    scope: "protected",
  };
};

const denialResponse = (): NextResponse =>
  new NextResponse(null, {
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
    status: 403,
  });

const forwardWithoutAuthorizationAssertions = (
  request: NextRequest,
): NextResponse => {
  const forwardedHeaders = new Headers(request.headers);
  for (const headerName of UNTRUSTED_AUTHORIZATION_HEADERS) {
    forwardedHeaders.delete(headerName);
  }

  return NextResponse.next({ request: { headers: forwardedHeaders } });
};

export const createAdminAccessMiddleware =
  (
    accessConfig: AdminAccessConfig,
    options: EvaluationOptions = {},
  ): ((request: NextRequest) => Promise<NextResponse>) =>
  async (request) => {
    const decision = await evaluateAdminAccess(request, accessConfig, options);
    if (decision.kind === "allow") {
      return forwardWithoutAuthorizationAssertions(request);
    }

    return denialResponse();
  };

export const middleware = async (
  request: NextRequest,
): Promise<NextResponse> => {
  const accessConfig = loadAdminAccessConfig(process.env);
  return createAdminAccessMiddleware(accessConfig)(request);
};

// next.config.ts supplies /admin as basePath; Next prefixes this source itself.
// Keeping the matcher broad makes all bypasses explicit in the exact allowlist.
export const config = {
  matcher: "/:path*",
};
