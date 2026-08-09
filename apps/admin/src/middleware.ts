import { NextResponse, type NextRequest } from "next/server";

const ADMIN_BASE_PATH = "/admin";
const CONFIGURATION_ERROR = "ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED";
const DEFAULT_MAX_SKEW_SECONDS = 300;
const MAX_CONFIGURED_SKEW_SECONDS = 3600;
const MINIMUM_SECRET_BYTES = 32;
const STATIC_DECODE_LIMIT = 3;
const CREDENTIAL_DECODE_LIMIT = 3;
const MAX_QUERY_BYTES = 8192;
const MAX_QUERY_PAIRS = 64;
const MAX_BODY_BYTES = 65_536;
const MAX_BODY_PAIRS = 256;
const MAX_BODY_DEPTH = 16;
const MAX_BODY_NODES = 2048;
const MAX_STREAM_CHUNKS = 1024;
const DEFAULT_BODY_READ_DEADLINE_MILLISECONDS = 1000;
const MAX_BODY_READ_DEADLINE_MILLISECONDS = 10_000;
const INGRESS_BODYLESS_PROOF_HEADER = "x-huoqiu-ingress-bodyless-proof";

const EDGE_HEADERS = Object.freeze({
  alphaAccess: "x-huoqiu-alpha-access",
  issuedAt: "x-huoqiu-edge-issued-at",
  issuer: "x-huoqiu-edge-issuer",
  signature: "x-huoqiu-edge-signature",
  subject: "x-huoqiu-edge-subject",
});

const CREDENTIAL_KEY_NAMES = new Set([
  "accesstoken",
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "invite",
  "invitecode",
  "idtoken",
  "refreshtoken",
  "session",
  "sessiontoken",
  "token",
]);

const STRUCTURED_CREDENTIAL_ROOTS = new Set([
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "invite",
  "session",
  "token",
]);

const STATE_CHANGING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

const UNTRUSTED_FORWARD_HEADERS = [
  "authorization",
  INGRESS_BODYLESS_PROOF_HEADER,
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
  bodyReadDeadlineMilliseconds?: number;
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

const containsControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
    ) {
      return true;
    }
  }

  return false;
};

const hasForbiddenSingleValueCharacter = (value: string): boolean => {
  for (const character of value) {
    if (character === "," || /\s/u.test(character)) {
      return true;
    }
  }

  return containsControlCharacter(value);
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
    hasForbiddenSingleValueCharacter(issuer) ||
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

    let decoded = segment;
    for (let pass = 0; pass < STATIC_DECODE_LIMIT; pass += 1) {
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\") ||
        containsControlCharacter(decoded)
      ) {
        return false;
      }

      let nextValue: string;
      try {
        nextValue = decodeURIComponent(decoded);
      } catch {
        return false;
      }
      if (nextValue === decoded) {
        return true;
      }
      decoded = nextValue;
    }

    return (
      decoded !== "." &&
      decoded !== ".." &&
      !decoded.includes("/") &&
      !decoded.includes("\\") &&
      !decoded.includes("%") &&
      !containsControlCharacter(decoded)
    );
  });
};

const recursivelyDecodeComponent = (
  rawValue: string,
  plusAsSpace: boolean,
): string | undefined => {
  let decoded = plusAsSpace ? rawValue.replaceAll("+", "%20") : rawValue;

  for (let pass = 0; pass < CREDENTIAL_DECODE_LIMIT; pass += 1) {
    if (!decoded.includes("%")) {
      return decoded;
    }

    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return undefined;
    }
  }

  return decoded.includes("%") ? undefined : decoded;
};

const isCredentialKey = (value: string): boolean => {
  const normalized = value.normalize("NFKC").toLowerCase();
  const parts = normalized.split(/[^a-z0-9]+/u).filter(Boolean);
  const compact = parts.join("");

  if (CREDENTIAL_KEY_NAMES.has(compact)) {
    return true;
  }

  if (
    parts.some(
      (part) =>
        STRUCTURED_CREDENTIAL_ROOTS.has(part) || CREDENTIAL_KEY_NAMES.has(part),
    )
  ) {
    return true;
  }

  return parts.some(
    (_part, index) =>
      index + 1 < parts.length &&
      CREDENTIAL_KEY_NAMES.has(parts.slice(index, index + 2).join("")),
  );
};

const containsBasicOrBearerCredential = (value: string): boolean =>
  /(?:^|[^a-z0-9])(?:basic|bearer)(?:\s+|[:=]\s*)\S+/iu.test(
    value.normalize("NFKC"),
  );

const hasUnsafeEncodedCredentialPairs = (
  rawPairs: string,
  maximumBytes: number,
  maximumPairs: number,
): boolean => {
  if (new TextEncoder().encode(rawPairs).byteLength > maximumBytes) {
    return true;
  }

  if (rawPairs.length === 0) {
    return false;
  }

  const pairs = rawPairs.split("&");
  if (pairs.length > maximumPairs) {
    return true;
  }

  for (const rawPair of pairs) {
    if (rawPair.length === 0) {
      return true;
    }

    const separatorIndex = rawPair.indexOf("=");
    const rawKey =
      separatorIndex < 0 ? rawPair : rawPair.slice(0, separatorIndex);
    const rawValue =
      separatorIndex < 0 ? "" : rawPair.slice(separatorIndex + 1);
    const key = recursivelyDecodeComponent(rawKey, true);
    const value = recursivelyDecodeComponent(rawValue, true);

    if (
      key === undefined ||
      value === undefined ||
      key.length === 0 ||
      key.length > 512 ||
      value.length > maximumBytes ||
      containsControlCharacter(key) ||
      containsControlCharacter(value) ||
      isCredentialKey(key) ||
      containsBasicOrBearerCredential(value)
    ) {
      return true;
    }
  }

  return false;
};

const hasUnsafeCredentialQuery = (requestUrl: URL): boolean =>
  requestUrl.search !== "" &&
  hasUnsafeEncodedCredentialPairs(
    requestUrl.search.slice(1),
    MAX_QUERY_BYTES,
    MAX_QUERY_PAIRS,
  );

const isPublicPathCandidate = (requestUrl: URL): boolean => {
  const path = routePath(requestUrl);
  return path === "/healthz" || path.startsWith("/_next/static/");
};

const isPublicAllowlistRequest = (
  request: NextRequest,
  requestUrl: URL,
): boolean => {
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    requestUrl.search !== ""
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
    hasForbiddenSingleValueCharacter(subject) ||
    issuer === null ||
    issuer.length === 0 ||
    issuer.length > 256 ||
    hasForbiddenSingleValueCharacter(issuer) ||
    issuer !== accessConfig.issuer ||
    rawIssuedAt === null ||
    rawSignature === null
  ) {
    return false;
  }

  if (hasForbiddenSingleValueCharacter(alphaAccess)) {
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

type SupportedBodyType = "form" | "json";

const readSupportedBodyType = (
  request: NextRequest,
): SupportedBodyType | undefined => {
  const rawContentType = request.headers.get("content-type");
  if (
    rawContentType === null ||
    rawContentType.length === 0 ||
    rawContentType.includes(",") ||
    containsControlCharacter(rawContentType)
  ) {
    return undefined;
  }

  const [rawMediaType, ...rawParameters] = rawContentType.split(";");
  const mediaType = rawMediaType?.trim().toLowerCase();
  const bodyType =
    mediaType === "application/json"
      ? "json"
      : mediaType === "application/x-www-form-urlencoded"
        ? "form"
        : undefined;
  if (bodyType === undefined) {
    return undefined;
  }

  let hasCharset = false;
  for (const rawParameter of rawParameters) {
    const separatorIndex = rawParameter.indexOf("=");
    if (separatorIndex < 0) {
      return undefined;
    }

    const name = rawParameter.slice(0, separatorIndex).trim().toLowerCase();
    const value = rawParameter
      .slice(separatorIndex + 1)
      .trim()
      .toLowerCase();
    if (name !== "charset" || value !== "utf-8" || hasCharset) {
      return undefined;
    }
    hasCharset = true;
  }

  return bodyType;
};

type ContentLengthState =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ bytes: number; kind: "valid" }>;

const readContentLengthState = (request: NextRequest): ContentLengthState => {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength === null) {
    return { kind: "absent" };
  }

  if (!/^(0|[1-9]\d*)$/u.test(rawContentLength)) {
    return { kind: "invalid" };
  }

  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength > MAX_BODY_BYTES) {
    return { kind: "invalid" };
  }

  return { bytes: contentLength, kind: "valid" };
};

const readBoundedBodyClone = async (
  request: NextRequest,
  deadlineMilliseconds: number,
): Promise<Uint8Array | undefined> => {
  let bodyClone: Request;
  try {
    bodyClone = request.clone();
  } catch {
    return undefined;
  }

  if (bodyClone.body === null) {
    return new Uint8Array();
  }

  const reader = bodyClone.body.getReader();
  const chunks: Uint8Array[] = [];
  let chunkCount = 0;
  let totalBytes = 0;
  let timedOut = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Readonly<{ kind: "deadline" }>>((resolve) => {
    deadlineTimer = setTimeout(
      () => resolve({ kind: "deadline" }),
      deadlineMilliseconds,
    );
  });

  try {
    while (true) {
      const outcome = await Promise.race([
        reader.read().then(
          (result) => ({ kind: "read" as const, result }),
          () => ({ kind: "read_error" as const }),
        ),
        deadline,
      ]);
      if (outcome.kind === "deadline") {
        timedOut = true;
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      if (outcome.kind === "read_error") {
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      if (outcome.result.done) {
        break;
      }

      chunkCount += 1;
      totalBytes += outcome.result.value.byteLength;
      if (chunkCount > MAX_STREAM_CHUNKS || totalBytes > MAX_BODY_BYTES) {
        // A clone is one branch of a tee. Awaiting cancellation can wait for
        // the untouched original branch, so initiate it and return immediately.
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(outcome.result.value);
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return undefined;
  } finally {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
    }
    if (!timedOut) {
      reader.releaseLock();
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const decodePotentialCredentialText = (value: string): string | undefined => {
  let decoded = value;
  for (let pass = 0; pass < CREDENTIAL_DECODE_LIMIT; pass += 1) {
    if (!/%[0-9a-f]{2}/iu.test(decoded)) {
      return decoded;
    }

    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return undefined;
    }
  }

  return /%[0-9a-f]{2}/iu.test(decoded) ? undefined : decoded;
};

interface JsonInspectionState {
  nodes: number;
}

const isSafeJsonValue = (
  value: unknown,
  depth: number,
  state: JsonInspectionState,
): boolean => {
  state.nodes += 1;
  if (depth > MAX_BODY_DEPTH || state.nodes > MAX_BODY_NODES) {
    return false;
  }

  if (typeof value === "string") {
    const decodedValue = decodePotentialCredentialText(value);
    return (
      decodedValue !== undefined &&
      !containsBasicOrBearerCredential(decodedValue)
    );
  }

  if (value === null || typeof value !== "object") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isSafeJsonValue(item, depth + 1, state));
  }

  for (const [rawKey, childValue] of Object.entries(value)) {
    const key = decodePotentialCredentialText(rawKey);
    if (
      key === undefined ||
      key.length === 0 ||
      key.length > 512 ||
      containsControlCharacter(key) ||
      isCredentialKey(key) ||
      !isSafeJsonValue(childValue, depth + 1, state)
    ) {
      return false;
    }
  }

  return true;
};

const verifyIngressBodylessProof = async (
  request: NextRequest,
  secret: string,
): Promise<boolean> => {
  const rawProof = request.headers.get(INGRESS_BODYLESS_PROOF_HEADER);
  if (rawProof === null) {
    return false;
  }

  const signature = decodeSignature(rawProof);
  if (signature === undefined) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const canonical = [
    "huoqiu-ingress-bodyless-v1",
    request.method.toUpperCase(),
    `${requestUrl.pathname}${requestUrl.search}`,
    "bodyless",
  ].join("\n");
  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
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

const hasSafeStateChangingBody = async (
  request: NextRequest,
  deadlineMilliseconds: number,
  secret: string,
): Promise<boolean> => {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const contentEncoding = request.headers.get("content-encoding");
  if (
    (contentEncoding !== null &&
      contentEncoding.toLowerCase() !== "identity") ||
    !Number.isSafeInteger(deadlineMilliseconds) ||
    deadlineMilliseconds < 1 ||
    deadlineMilliseconds > MAX_BODY_READ_DEADLINE_MILLISECONDS
  ) {
    return false;
  }

  const contentLength = readContentLengthState(request);
  if (contentLength.kind === "invalid") {
    return false;
  }

  const contentTypeIsAbsentOrSupported =
    request.headers.get("content-type") === null ||
    readSupportedBodyType(request) !== undefined;
  const rawIngressBodylessProof = request.headers.get(
    INGRESS_BODYLESS_PROOF_HEADER,
  );
  const ingressBodylessProofIsValid = await verifyIngressBodylessProof(
    request,
    secret,
  );
  if (rawIngressBodylessProof !== null && !ingressBodylessProofIsValid) {
    return false;
  }
  if (ingressBodylessProofIsValid) {
    return (
      request.headers.get("transfer-encoding") === null &&
      (contentLength.kind === "absent" || contentLength.bytes === 0) &&
      contentTypeIsAbsentOrSupported
    );
  }

  if (request.body === null) {
    const lengthIsEmpty =
      contentLength.kind === "absent" || contentLength.bytes === 0;
    return lengthIsEmpty && contentTypeIsAbsentOrSupported;
  }

  if (contentLength.kind === "valid" && contentLength.bytes === 0) {
    if (!contentTypeIsAbsentOrSupported) {
      return false;
    }
    const explicitlyEmptyBody = await readBoundedBodyClone(
      request,
      deadlineMilliseconds,
    );
    return explicitlyEmptyBody?.byteLength === 0;
  }

  const bodyType = readSupportedBodyType(request);
  if (bodyType === undefined) {
    return false;
  }

  const bodyBytes = await readBoundedBodyClone(request, deadlineMilliseconds);
  if (bodyBytes === undefined) {
    return false;
  }

  let bodyText: string;
  try {
    bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  } catch {
    return false;
  }

  if (bodyType === "form") {
    return !hasUnsafeEncodedCredentialPairs(
      bodyText,
      MAX_BODY_BYTES,
      MAX_BODY_PAIRS,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyText) as unknown;
  } catch {
    return false;
  }

  return isSafeJsonValue(parsedBody, 0, { nodes: 0 });
};

export const evaluateAdminAccess = async (
  request: NextRequest,
  accessConfig: AdminAccessConfig,
  options: EvaluationOptions = {},
): Promise<AdminAccessDecision> => {
  const requestUrl = new URL(request.url);

  if (request.headers.has("authorization")) {
    return {
      checkpoint: "session",
      kind: "deny",
    };
  }

  if (isPublicPathCandidate(requestUrl) && requestUrl.search !== "") {
    return {
      checkpoint: "session",
      kind: "deny",
    };
  }

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

  if (hasUnsafeCredentialQuery(requestUrl)) {
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

  if (
    !(await hasSafeStateChangingBody(
      request,
      options.bodyReadDeadlineMilliseconds ??
        DEFAULT_BODY_READ_DEADLINE_MILLISECONDS,
      accessConfig.secret,
    ))
  ) {
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
  for (const headerName of UNTRUSTED_FORWARD_HEADERS) {
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
