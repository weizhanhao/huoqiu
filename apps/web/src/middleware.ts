import { m1Router } from "@huoqiu/contracts/m1";
import { NextResponse, type NextRequest } from "next/server";

import {
  loadZeroTrustConfiguration,
  type ZeroTrustConfiguration,
} from "./zero-trust-configuration";

export const WEB_SESSION_COOKIE = Object.freeze({
  httpOnly: true,
  name: "__Secure-huoqiu.session_token",
  path: "/",
  sameSite: "lax" as const,
  secure: true,
});

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

type WebBoundaryRuntime = Readonly<{
  environment: RuntimeEnvironment;
  now: () => number;
}>;

const EDGE_SUBJECT_HEADER = "x-huoqiu-edge-subject";
const EDGE_ISSUER_HEADER = "x-huoqiu-edge-issuer";
const ALPHA_ACCESS_HEADER = "x-huoqiu-alpha-access";
const EDGE_ISSUED_AT_HEADER = "x-huoqiu-edge-issued-at";
const EDGE_SIGNATURE_HEADER = "x-huoqiu-edge-signature";
const MAX_IDENTITY_FIELD_LENGTH = 256;
const CONTROL_CHARACTER_PATTERN = /\p{C}/u;
const EDGE_TEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const ALPHA_VALUE_PATTERN = /^[^,\s]{0,16}$/u;
const UNIX_SECONDS_PATTERN = /^(?:0|[1-9]\d*)$/u;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/u;
const MAX_SESSION_COOKIE_LENGTH = 4096;
const MAX_INSPECTED_BODY_BYTES = 8 * 1024;
const MAX_INSPECTED_BODY_NODES = 1024;
const MAX_BODY_READ_MILLISECONDS = 1_000;
const MAX_PERCENT_DECODE_PASSES = 4;
const NEXT_STATIC_PREFIX = "/_next/static/";
const SAFE_PUBLIC_METHODS = new Set(["GET", "HEAD"]);
const SESSION_OPTIONAL_PATHS = new Set(["/login", "/register"]);
const QUERY_CREDENTIAL_FIELD_FRAGMENTS = [
  "authorization",
  "bearer",
  "credential",
  "invite",
  "token",
] as const;
const BODY_CREDENTIAL_FIELD_FRAGMENTS = [
  "authorization",
  "bearer",
  "credential",
  "invite",
  "token",
] as const;
const BEARER_VALUE_PATTERN = /^\s*(?:basic|bearer)\s+\S/iu;
const textEncoder = new TextEncoder();
const BODY_READ_TIMEOUT = Symbol("BODY_READ_TIMEOUT");

const rejection = (status: 401 | 403 | 503, message: string): NextResponse =>
  new NextResponse(message, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });

const hasControlCharacter = (value: string): boolean =>
  CONTROL_CHARACTER_PATTERN.test(value);

const isValidIdentityField = (value: string | null): value is string =>
  value !== null &&
  value.length > 0 &&
  value.length <= MAX_IDENTITY_FIELD_LENGTH &&
  value.trim() === value &&
  !hasControlCharacter(value) &&
  EDGE_TEXT_PATTERN.test(value);

const decodeHex = (value: string): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
};

const verifyHmac = async (
  secret: string,
  canonical: string,
  receivedHex: string,
): Promise<boolean> => {
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { hash: "SHA-256", name: "HMAC" },
      false,
      ["verify"],
    );

    return await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      decodeHex(receivedHex),
      textEncoder.encode(canonical),
    );
  } catch {
    return false;
  }
};

const hasValidEdgeProof = async (
  request: NextRequest,
  configuration: ZeroTrustConfiguration,
  nowMilliseconds: number,
): Promise<boolean> => {
  const subject = request.headers.get(EDGE_SUBJECT_HEADER);
  const issuer = request.headers.get(EDGE_ISSUER_HEADER);
  const alphaAccess = request.headers.get(ALPHA_ACCESS_HEADER) ?? "";
  const issuedAtValue = request.headers.get(EDGE_ISSUED_AT_HEADER);
  const signatureValue = request.headers.get(EDGE_SIGNATURE_HEADER);

  if (
    !isValidIdentityField(subject) ||
    !isValidIdentityField(issuer) ||
    !ALPHA_VALUE_PATTERN.test(alphaAccess) ||
    issuer !== configuration.issuer ||
    issuedAtValue === null ||
    !UNIX_SECONDS_PATTERN.test(issuedAtValue) ||
    signatureValue === null
  ) {
    return false;
  }

  const issuedAt = Number(issuedAtValue);
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(nowSeconds) ||
    Math.abs(nowSeconds - issuedAt) > configuration.maxSkewSeconds
  ) {
    return false;
  }

  const signatureMatch = SIGNATURE_PATTERN.exec(signatureValue);
  if (signatureMatch?.[1] === undefined) {
    return false;
  }

  const canonical = [
    "v1",
    request.method.toUpperCase(),
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    subject,
    issuer,
    alphaAccess,
    issuedAtValue,
  ].join("\n");

  return verifyHmac(configuration.hmacSecret, canonical, signatureMatch[1]);
};

const recursivelyDecodePercentEncoding = (
  value: string,
): string | undefined => {
  let decoded = value;
  for (let pass = 0; pass < MAX_PERCENT_DECODE_PASSES; pass += 1) {
    if (!decoded.includes("%")) return decoded;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return undefined;
      decoded = next;
    } catch {
      return undefined;
    }
  }
  return decoded.includes("%") ? undefined : decoded;
};

const normalizeFieldName = (fieldName: string): string | undefined => {
  const decodedName = recursivelyDecodePercentEncoding(fieldName);
  if (decodedName === undefined) return undefined;

  return decodedName.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
};

const hasFieldNameFragment = (
  fieldName: string,
  fragments: readonly string[],
): boolean => {
  const normalizedName = normalizeFieldName(fieldName);
  return (
    normalizedName === undefined ||
    fragments.some((fragment) => normalizedName.includes(fragment))
  );
};

const isQueryCredentialFieldName = (fieldName: string): boolean =>
  hasFieldNameFragment(fieldName, QUERY_CREDENTIAL_FIELD_FRAGMENTS);

const isBodyCredentialFieldName = (fieldName: string): boolean =>
  hasFieldNameFragment(fieldName, BODY_CREDENTIAL_FIELD_FRAGMENTS);

type StrictRawPair = readonly [field: string, value: string];

const parseStrictRawPairs = (
  serializedPairs: string,
): StrictRawPair[] | undefined => {
  if (serializedPairs.length === 0 || serializedPairs.includes(";")) {
    return undefined;
  }

  const parsedPairs: StrictRawPair[] = [];
  for (const pair of serializedPairs.split("&")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex !== pair.lastIndexOf("=")) {
      return undefined;
    }
    parsedPairs.push([
      pair.slice(0, separatorIndex),
      pair.slice(separatorIndex + 1),
    ]);
  }
  return parsedPairs;
};

const hasSafeCredentialFreeQuery = (search: string): boolean => {
  if (search.length === 0) return true;
  if (!search.startsWith("?")) return false;

  const decoded = recursivelyDecodePercentEncoding(search.slice(1));
  if (decoded === undefined) return false;
  const pairs = parseStrictRawPairs(decoded);
  return (
    pairs !== undefined &&
    pairs.every(([fieldName]) => !isQueryCredentialFieldName(fieldName))
  );
};

const isSafeNextStaticPath = (pathname: string): boolean => {
  if (!pathname.startsWith(NEXT_STATIC_PREFIX)) return false;

  const decoded = recursivelyDecodePercentEncoding(pathname);
  if (decoded === undefined || decoded !== pathname) return false;

  const segments = decoded.slice(NEXT_STATIC_PREFIX.length).split("/");
  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\"),
    )
  );
};

const isFullyPublicRequest = (request: NextRequest): boolean => {
  if (!SAFE_PUBLIC_METHODS.has(request.method)) {
    return false;
  }

  const { pathname, search } = request.nextUrl;
  if (pathname === "/healthz") {
    return search.length === 0;
  }

  if (pathname === "/icon.svg") {
    return search.length === 0;
  }

  return search.length === 0 && isSafeNextStaticPath(pathname);
};

const hasForbiddenNonCookieCredential = (request: NextRequest): boolean => {
  if (request.headers.has("authorization")) {
    return true;
  }

  return !hasSafeCredentialFreeQuery(request.nextUrl.search);
};

type BodyKind = "form" | "json";

const bodyKind = (request: NextRequest): BodyKind | undefined => {
  const rawContentType = request.headers.get("content-type");
  if (rawContentType === null || rawContentType.includes(",")) return undefined;

  const [rawMediaType, ...rawParameters] = rawContentType.split(";");
  const mediaType = rawMediaType?.trim().toLowerCase();
  const parametersAreUtf8 = rawParameters.every((parameter) =>
    /^charset=utf-8$/iu.test(parameter.trim()),
  );
  if (!parametersAreUtf8) return undefined;
  if (mediaType === "application/json") return "json";
  if (mediaType === "application/x-www-form-urlencoded") return "form";
  return undefined;
};

type BodyReadResult =
  | Readonly<{ bytes: Uint8Array<ArrayBuffer>; ok: true }>
  | Readonly<{ ok: false }>;

const abortOriginalBody = (request: NextRequest): void => {
  if (request.body === null || request.bodyUsed) return;
  void request.body.cancel().catch(() => undefined);
};

const failedBodyRead = (request: NextRequest): BodyReadResult => {
  abortOriginalBody(request);
  return { ok: false };
};

const readBoundedBody = async (
  request: NextRequest,
): Promise<BodyReadResult> => {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    if (!UNIX_SECONDS_PATTERN.test(rawContentLength)) {
      return failedBodyRead(request);
    }
    const contentLength = Number(rawContentLength);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > MAX_INSPECTED_BODY_BYTES
    ) {
      return failedBodyRead(request);
    }
  }

  let clone: Request;
  try {
    clone = request.clone();
  } catch {
    return failedBodyRead(request);
  }
  if (clone.body === null) return { bytes: new Uint8Array(), ok: true };

  const reader = clone.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof BODY_READ_TIMEOUT>((resolve) => {
    timeoutId = setTimeout(
      () => resolve(BODY_READ_TIMEOUT),
      MAX_BODY_READ_MILLISECONDS,
    );
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result === BODY_READ_TIMEOUT) {
        void reader.cancel().catch(() => undefined);
        return failedBodyRead(request);
      }
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_INSPECTED_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return failedBodyRead(request);
      }
      chunks.push(result.value);
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return failedBodyRead(request);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, ok: true };
};

const containsSensitiveValue = (value: unknown): boolean => {
  const pending: unknown[] = [value];
  let inspectedNodes = 0;
  while (pending.length > 0) {
    inspectedNodes += 1;
    if (inspectedNodes > MAX_INSPECTED_BODY_NODES) return true;
    const candidate = pending.pop();
    if (typeof candidate === "string") {
      if (BEARER_VALUE_PATTERN.test(candidate)) return true;
      continue;
    }
    if (Array.isArray(candidate)) {
      pending.push(...candidate);
      continue;
    }
    if (candidate !== null && typeof candidate === "object") {
      for (const [field, nestedValue] of Object.entries(candidate)) {
        if (isBodyCredentialFieldName(field)) return true;
        pending.push(nestedValue);
      }
    }
  }
  return false;
};

const isWebAuthContractPost = (request: NextRequest): boolean =>
  request.method === "POST" &&
  (request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register");

const hasValidWebAuthBody = (
  pathname: string,
  parsedBody: unknown,
): boolean => {
  if (pathname === "/register") {
    return m1Router.authRegister.body.safeParse(parsedBody).success;
  }

  const result = m1Router.authLogin.body.safeParse(parsedBody);
  return result.success && result.data.transport === "cookie";
};

type BodyInspection = "credential" | "invalid" | "safe";

const inspectCredentialFreeForm = (body: string): BodyInspection => {
  const decoded = recursivelyDecodePercentEncoding(body);
  if (decoded === undefined) return "invalid";
  const pairs = parseStrictRawPairs(decoded);
  if (pairs === undefined) return "invalid";
  return pairs.some(
    ([field, formValue]) =>
      isBodyCredentialFieldName(field) ||
      BEARER_VALUE_PATTERN.test(formValue.replaceAll("+", " ")),
  )
    ? "credential"
    : "safe";
};

const hasSafeCredentialFreeBody = async (
  request: NextRequest,
): Promise<boolean> => {
  const authContractPost = isWebAuthContractPost(request);
  if (request.body === null) return !authContractPost;
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  ) {
    abortOriginalBody(request);
    return false;
  }

  const kind = bodyKind(request);
  if (kind === undefined || (authContractPost && kind !== "json")) {
    abortOriginalBody(request);
    return false;
  }
  const result = await readBoundedBody(request);
  if (!result.ok) return false;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(result.bytes);
  } catch {
    abortOriginalBody(request);
    return false;
  }

  if (kind === "form") {
    const inspection = inspectCredentialFreeForm(text);
    if (inspection === "invalid") abortOriginalBody(request);
    return inspection === "safe";
  }

  try {
    const parsedBody = JSON.parse(text) as unknown;
    if (!authContractPost) return !containsSensitiveValue(parsedBody);
    const valid = hasValidWebAuthBody(request.nextUrl.pathname, parsedBody);
    if (!valid) abortOriginalBody(request);
    return valid;
  } catch {
    abortOriginalBody(request);
    return false;
  }
};

const hasSingleSessionCookie = (request: NextRequest): boolean => {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) {
    return false;
  }

  const sessionValues = cookieHeader.split(";").flatMap((part) => {
    const candidate = part.trim();
    const separatorIndex = candidate.indexOf("=");
    return separatorIndex > 0 &&
      candidate.slice(0, separatorIndex) === WEB_SESSION_COOKIE.name
      ? [candidate.slice(separatorIndex + 1)]
      : [];
  });
  if (sessionValues.length !== 1) {
    return false;
  }

  const sessionValue = sessionValues[0];
  return (
    sessionValue !== undefined &&
    sessionValue.length > 0 &&
    sessionValue.length <= MAX_SESSION_COOKIE_LENGTH &&
    !hasControlCharacter(sessionValue)
  );
};

export const enforceWebBoundary = async (
  request: NextRequest,
  runtime: WebBoundaryRuntime,
): Promise<NextResponse> => {
  if (hasForbiddenNonCookieCredential(request)) {
    return rejection(401, "Unauthorized");
  }

  if (isFullyPublicRequest(request)) {
    return NextResponse.next();
  }

  let configuration: ZeroTrustConfiguration;
  try {
    configuration = loadZeroTrustConfiguration(runtime.environment);
  } catch {
    return rejection(503, "Service unavailable");
  }

  if (!(await hasValidEdgeProof(request, configuration, runtime.now()))) {
    return rejection(401, "Unauthorized");
  }

  if (request.headers.get(ALPHA_ACCESS_HEADER) !== "true") {
    return rejection(403, "Forbidden");
  }

  if (!(await hasSafeCredentialFreeBody(request))) {
    return rejection(401, "Unauthorized");
  }

  if (SESSION_OPTIONAL_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // This only enforces the browser transport boundary. The API remains the
  // authority for session authenticity, expiry, revocation, and ownership.
  if (!hasSingleSessionCookie(request)) {
    return rejection(401, "Unauthorized");
  }

  return NextResponse.next();
};

export const middleware = (request: NextRequest): Promise<NextResponse> =>
  enforceWebBoundary(request, {
    environment: process.env,
    now: Date.now,
  });

// Keep this literal so Next can statically analyze the matcher at build time.
export const config = {
  matcher: ["/:path*"],
};
