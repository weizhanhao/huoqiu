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
const UNIX_SECONDS_PATTERN = /^(?:0|[1-9]\d*)$/u;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/u;
const MAX_SESSION_COOKIE_LENGTH = 4096;
const SAFE_PUBLIC_METHODS = new Set(["GET", "HEAD"]);
const SESSION_OPTIONAL_PATHS = new Set(["/login", "/register"]);
const FORBIDDEN_QUERY_CREDENTIALS = new Set(["access_token", "session_token"]);
const textEncoder = new TextEncoder();

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
  !hasControlCharacter(value);

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

const isValidImageRequest = (request: NextRequest): boolean => {
  const parameters = request.nextUrl.searchParams;
  const urlValues = parameters.getAll("url");
  const widthValues = parameters.getAll("w");
  const qualityValues = parameters.getAll("q");
  const parameterNames = [...parameters.keys()];

  return (
    parameterNames.length === 3 &&
    parameterNames.every(
      (name) => name === "url" || name === "w" || name === "q",
    ) &&
    urlValues.length === 1 &&
    urlValues[0] !== undefined &&
    urlValues[0].length > 0 &&
    urlValues[0].length <= 2048 &&
    widthValues.length === 1 &&
    /^(?:[1-9]\d*)$/u.test(widthValues[0] ?? "") &&
    qualityValues.length === 1 &&
    /^(?:[1-9]\d*)$/u.test(qualityValues[0] ?? "")
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
    return true;
  }

  if (pathname.startsWith("/_next/static/")) {
    return pathname.length > "/_next/static/".length;
  }

  return pathname === "/_next/image" && isValidImageRequest(request);
};

const hasForbiddenNonCookieCredential = (request: NextRequest): boolean => {
  if (request.headers.has("authorization")) {
    return true;
  }

  for (const parameterName of request.nextUrl.searchParams.keys()) {
    if (FORBIDDEN_QUERY_CREDENTIALS.has(parameterName)) {
      return true;
    }
  }

  return false;
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

  if (hasForbiddenNonCookieCredential(request)) {
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
  matcher: ["/((?!_next/static/|icon\\.svg$).*)"],
};
