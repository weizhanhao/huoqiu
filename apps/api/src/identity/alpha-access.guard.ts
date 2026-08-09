import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { identityHttpException, validationFailure } from "./identity-error.js";

const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_CLOCK_SKEW_SECONDS = 3_600;
const MAX_EDGE_TEXT_LENGTH = 256;
const LOWER_HEX_SIGNATURE = /^v1=([0-9a-f]{64})$/u;
const CANONICAL_UNIX_SECONDS = /^(?:0|[1-9]\d*)$/u;
const ALPHA_ACCESS_VALUE = /^(?:false|true)$/u;
const CONTROL_CHARACTER = /\p{C}/u;
const SCALAR_SEPARATOR_OR_WHITESPACE = /[,\s]/u;
const EDGE_SUBJECT_CONTEXT = Symbol("huoqiu:identity:verified-edge-subject");
const MAX_AUTH_REQUEST_TARGET_LENGTH = 2_048;
const AUTH_CONTRACT_PATHS = [
  "/v1/auth/register",
  "/v1/auth/login",
  "/v1/auth/session",
  "/v1/auth/logout",
] as const;
const MAX_AUTH_CONTRACT_PATH_LENGTH = Math.max(
  ...AUTH_CONTRACT_PATHS.map((path) => path.length),
);

type RequestWithEdgeSubject = FastifyRequest & {
  [EDGE_SUBJECT_CONTEXT]?: string;
};

export const getVerifiedEdgeSubject = (request: FastifyRequest): string => {
  const subject = (request as RequestWithEdgeSubject)[EDGE_SUBJECT_CONTEXT];
  if (subject === undefined) {
    throw identityHttpException(
      HttpStatus.UNAUTHORIZED,
      "AUTH_REQUIRED",
      "Valid edge proof is required",
    );
  }
  return subject;
};

export type ZeroTrustConfiguration = Readonly<{
  issuer: string;
  maxClockSkewSeconds: number;
  secret: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

export class ZeroTrustConfigurationError extends Error {
  override readonly name = "ZeroTrustConfigurationError";
}

const isSecuredEnvironment = (environment: Environment): boolean =>
  environment.APP_ENV === "production" || environment.APP_ENV === "staging";

const isBoundedEdgeText = (value: string): boolean =>
  value.length > 0 &&
  value.length <= MAX_EDGE_TEXT_LENGTH &&
  value.trim() === value &&
  !CONTROL_CHARACTER.test(value) &&
  !SCALAR_SEPARATOR_OR_WHITESPACE.test(value);

const parseMaximumClockSkew = (raw: string | undefined): number => {
  if (raw === undefined) return DEFAULT_MAX_CLOCK_SKEW_SECONDS;
  if (!CANONICAL_UNIX_SECONDS.test(raw)) {
    throw new ZeroTrustConfigurationError("ZERO_TRUST_CONFIGURATION_INVALID");
  }
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CLOCK_SKEW_SECONDS
  ) {
    throw new ZeroTrustConfigurationError("ZERO_TRUST_CONFIGURATION_INVALID");
  }
  return parsed;
};

export const resolveZeroTrustConfiguration = (
  environment: Environment = process.env,
): ZeroTrustConfiguration | undefined => {
  const secret = environment.ZERO_TRUST_HMAC_SECRET;
  const issuer = environment.ZERO_TRUST_ISSUER;

  if (secret === undefined && issuer === undefined) {
    if (isSecuredEnvironment(environment)) {
      throw new ZeroTrustConfigurationError("ZERO_TRUST_CONFIGURATION_MISSING");
    }
    return undefined;
  }

  if (
    secret === undefined ||
    issuer === undefined ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    !isBoundedEdgeText(issuer)
  ) {
    throw new ZeroTrustConfigurationError("ZERO_TRUST_CONFIGURATION_INVALID");
  }

  return {
    issuer,
    maxClockSkewSeconds: parseMaximumClockSkew(
      environment.ZERO_TRUST_MAX_SKEW_SECONDS,
    ),
    secret,
  };
};

export const assertZeroTrustConfiguration = (
  environment: Environment = process.env,
): void => {
  const configuration = resolveZeroTrustConfiguration(environment);
  if (configuration === undefined && isSecuredEnvironment(environment)) {
    throw new ZeroTrustConfigurationError("ZERO_TRUST_CONFIGURATION_MISSING");
  }
};

const singleHeader = (
  headers: FastifyRequest["headers"],
  name: string,
): string => {
  const value = headers[name];
  return typeof value === "string" ? value : "";
};

const canonicalPayload = (
  input: Readonly<{
    alphaAccess: string;
    issuedAt: string;
    issuer: string;
    method: string;
    subject: string;
    url: string;
  }>,
): string =>
  [
    "v1",
    input.method.toUpperCase(),
    input.url,
    input.subject,
    input.issuer,
    input.alphaAccess,
    input.issuedAt,
  ].join("\n");

const edgeAuthenticationFailure = () =>
  identityHttpException(
    HttpStatus.UNAUTHORIZED,
    "AUTH_REQUIRED",
    "Valid edge proof is required",
  );

const alphaAccessFailure = () =>
  identityHttpException(
    HttpStatus.FORBIDDEN,
    "FORBIDDEN",
    "Alpha access is required",
  );

const isAuthContractPath = (value: string): boolean =>
  AUTH_CONTRACT_PATHS.some((path) => path === value);

const assertAuthRequestTargetShape = (request: FastifyRequest): void => {
  const rawUrl = request.raw?.url;
  const requestTarget = typeof rawUrl === "string" ? rawUrl : request.url;
  const prefix = requestTarget.slice(0, MAX_AUTH_CONTRACT_PATH_LENGTH + 1);
  const queryMarker = prefix.indexOf("?");
  const inferredPath =
    queryMarker === -1 ? prefix : prefix.slice(0, queryMarker);
  const routePath = request.routeOptions?.url;
  const isAuthContract =
    (typeof routePath === "string" && isAuthContractPath(routePath)) ||
    isAuthContractPath(inferredPath);
  if (!isAuthContract) return;
  if (
    requestTarget.length === 0 ||
    requestTarget.length > MAX_AUTH_REQUEST_TARGET_LENGTH ||
    CONTROL_CHARACTER.test(requestTarget) ||
    queryMarker !== -1
  ) {
    throw validationFailure();
  }
};

@Injectable()
export class AlphaAccessGuard implements CanActivate {
  constructor(
    private readonly configuration: ZeroTrustConfiguration | undefined,
    private readonly nowSeconds: () => number = () =>
      Math.floor(Date.now() / 1000),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    assertAuthRequestTargetShape(request);
    if (
      request.url === "/healthz" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return true;
    }

    const configuration = this.configuration;
    if (configuration === undefined) throw edgeAuthenticationFailure();

    const alphaAccess = singleHeader(request.headers, "x-huoqiu-alpha-access");
    const issuedAt = singleHeader(request.headers, "x-huoqiu-edge-issued-at");
    const requestIssuer = singleHeader(request.headers, "x-huoqiu-edge-issuer");
    const rawSignature = singleHeader(
      request.headers,
      "x-huoqiu-edge-signature",
    );
    const subject = singleHeader(request.headers, "x-huoqiu-edge-subject");
    const signatureMatch = LOWER_HEX_SIGNATURE.exec(rawSignature);
    const signatureHex = signatureMatch?.[1];
    const issuedAtValid = CANONICAL_UNIX_SECONDS.test(issuedAt);
    const issuedAtNumber = issuedAtValid ? Number(issuedAt) : Number.NaN;

    if (
      !isBoundedEdgeText(subject) ||
      !isBoundedEdgeText(requestIssuer) ||
      requestIssuer !== configuration.issuer ||
      !issuedAtValid ||
      !Number.isSafeInteger(issuedAtNumber) ||
      Math.abs(this.nowSeconds() - issuedAtNumber) >
        configuration.maxClockSkewSeconds ||
      signatureHex === undefined
    ) {
      throw edgeAuthenticationFailure();
    }

    const expected = createHmac("sha256", configuration.secret)
      .update(
        canonicalPayload({
          alphaAccess,
          issuedAt,
          issuer: requestIssuer,
          method: request.method,
          subject,
          url: request.url,
        }),
      )
      .digest();
    const received = Buffer.from(signatureHex, "hex");
    if (
      received.byteLength !== expected.byteLength ||
      !timingSafeEqual(received, expected)
    ) {
      throw edgeAuthenticationFailure();
    }

    if (!ALPHA_ACCESS_VALUE.test(alphaAccess)) {
      throw edgeAuthenticationFailure();
    }
    if (alphaAccess !== "true") throw alphaAccessFailure();
    (request as RequestWithEdgeSubject)[EDGE_SUBJECT_CONTEXT] = subject;
    return true;
  }
}
