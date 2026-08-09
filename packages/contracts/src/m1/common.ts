import { z } from "zod";

export const errorCodes = [
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "DATA_STALE",
  "DATA_UNAVAILABLE",
  "ENTITLEMENT_DENIED",
  "CONTENT_UNAVAILABLE",
  "LEDGER_INVARIANT_FAILED",
  "STREAM_CURSOR_EXPIRED",
] as const;

const sensitivePublicContentPatterns = [
  /(?:^|\s)at\s+(?:async\s+)?(?:[^()\s]+\s+\()?(?:(?:file:\/\/)?\/|[A-Za-z]:\\)[^)\r\n]+:\d+:\d+\)?/u,
  /\b(?:select|insert|update|delete)\b[\s\S]*\b(?:from|into|set|where|values)\b/iu,
  /(?:^|[\s("'=:[{])\/(?:srv|app|home|users|var|etc|opt|tmp)\/[^\s"'<>]+/iu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /\beyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]{2,}){0,2}\b/u,
  /\b(?:token|api[_-]?key|secret|password)\s*=\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;]+)/iu,
] as const;

const isSafePublicContent = (value: string): boolean =>
  sensitivePublicContentPatterns.every((pattern) => !pattern.test(value));

const MAX_NON_NEGATIVE_INT64 = "9223372036854775807";
const NON_NEGATIVE_INT64_PATTERN = /^(?:0|[1-9]\d{0,18})$/u;

const isNonNegativeInt64String = (value: string): boolean =>
  NON_NEGATIVE_INT64_PATTERN.test(value) &&
  (value.length < MAX_NON_NEGATIVE_INT64.length ||
    value <= MAX_NON_NEGATIVE_INT64);

export const versionStringSchema = z
  .string()
  .refine(isNonNegativeInt64String, "Expected a non-negative int64 string");

const strongInt64EntityTagSchema = z.string().refine((value) => {
  if (!value.startsWith('"') || !value.endsWith('"')) {
    return false;
  }
  return isNonNegativeInt64String(value.slice(1, -1));
}, "Expected a strong entity tag containing a non-negative int64 string");

const publicAliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/u)
  .refine(isSafePublicContent);

export const apiErrorSchema = z
  .object({
    code: z.enum(errorCodes),
    message: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => value.trim().length > 0)
      .refine((value) => !/\p{Cc}/u.test(value))
      .refine(isSafePublicContent),
    details: z
      .object({
        field: publicAliasSchema.optional(),
        constraint: publicAliasSchema.optional(),
        retry_after: z.number().int().min(0).max(86_400).optional(),
        conflict_version: versionStringSchema.optional(),
      })
      .strict(),
    trace_id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/u),
  })
  .strict();

export const requestMetaSchema = z
  .object({
    request_id: z.string().min(1),
    trace_id: z.string().min(1),
  })
  .strict();

export const idempotencyHeaderSchema = z
  .object({
    "idempotency-key": z.string().min(8).max(128),
  })
  .passthrough();

export const ifMatchHeaderSchema = z
  .object({
    "if-match": strongInt64EntityTagSchema,
  })
  .passthrough();

export const idempotencyIfMatchHeaderSchema = z
  .object({
    "idempotency-key": z.string().min(8).max(128),
    "if-match": strongInt64EntityTagSchema,
  })
  .passthrough();

export const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/u);
export const timestampSchema = z.string().datetime({ offset: true });
export const resourceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    "Expected a safe opaque resource identifier",
  );

const residualPercentEncodingPattern = /%[0-9A-Fa-f]{2}/u;
const unsafeRawDeepLinkPattern = /[\\\p{C}\p{White_Space}]/u;
const unsafeSearchValuePattern = /[+/\\?#&=\p{C}\p{White_Space}]/u;

const decodeOnce = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const isApprovedResourceId = (encodedId: string): boolean => {
  const decodedId = decodeOnce(encodedId);
  return (
    decodedId !== undefined &&
    !residualPercentEncodingPattern.test(decodedId) &&
    resourceIdSchema.safeParse(decodedId).success
  );
};

const isApprovedSearchQuery = (encodedQuery: string | undefined): boolean => {
  if (encodedQuery === undefined) {
    return true;
  }
  if (encodedQuery.length === 0) {
    return false;
  }

  const pairs = encodedQuery.split("&");
  if (pairs.length !== 1) {
    return false;
  }
  const parts = pairs[0]?.split("=") ?? [];
  if (parts.length !== 2 || parts[0] !== "q") {
    return false;
  }

  const value = decodeOnce(parts[1] ?? "");
  return (
    value !== undefined &&
    value.length <= 120 &&
    !residualPercentEncodingPattern.test(value) &&
    !unsafeSearchValuePattern.test(value)
  );
};

const splitDeepLinkQuery = (
  value: string,
): Readonly<{ target: string; query: string | undefined }> => {
  const queryIndex = value.indexOf("?");
  return queryIndex === -1
    ? { target: value, query: undefined }
    : {
        target: value.slice(0, queryIndex),
        query: value.slice(queryIndex + 1),
      };
};

const approvedStaticWebPaths = new Set([
  "/",
  "/login",
  "/watchlist",
  "/compose",
  "/notifications",
  "/portfolios",
]);
const approvedWebResourcePrefixes = [
  "/instruments/",
  "/posts/",
  "/portfolios/",
] as const;

const isApprovedWebDeepLink = (value: string): boolean => {
  const { target, query } = splitDeepLinkQuery(value);
  if (!target.startsWith("/") || target.startsWith("//")) {
    return false;
  }
  if (target === "/search") {
    return isApprovedSearchQuery(query);
  }
  if (query !== undefined) {
    return false;
  }
  if (approvedStaticWebPaths.has(target)) {
    return true;
  }

  const prefix = approvedWebResourcePrefixes.find((candidate) =>
    target.startsWith(candidate),
  );
  return (
    prefix !== undefined && isApprovedResourceId(target.slice(prefix.length))
  );
};

const approvedStaticAppTargets = new Set([
  "home",
  "login",
  "search",
  "watchlist",
  "compose",
  "notifications",
  "portfolios",
]);
const approvedAppResourceTargets = new Set(["instrument", "post", "portfolio"]);

const isApprovedAppDeepLink = (value: string): boolean => {
  if (!value.startsWith("huoqiu://")) {
    return false;
  }

  const { target, query } = splitDeepLinkQuery(value.slice("huoqiu://".length));
  const pathIndex = target.indexOf("/");
  const authority = pathIndex === -1 ? target : target.slice(0, pathIndex);
  const targetPath = pathIndex === -1 ? "" : target.slice(pathIndex);

  if (
    authority.length === 0 ||
    authority.includes("@") ||
    authority.includes(":") ||
    authority.includes("%")
  ) {
    return false;
  }
  if (approvedStaticAppTargets.has(authority)) {
    return (
      targetPath.length === 0 &&
      (authority === "search"
        ? isApprovedSearchQuery(query)
        : query === undefined)
    );
  }
  return (
    approvedAppResourceTargets.has(authority) &&
    query === undefined &&
    targetPath.startsWith("/") &&
    isApprovedResourceId(targetPath.slice(1))
  );
};

const isSafeDeepLink = (value: string): boolean => {
  if (
    unsafeRawDeepLinkPattern.test(value) ||
    value.includes("#") ||
    value !== value.trim()
  ) {
    return false;
  }
  return value.startsWith("/")
    ? isApprovedWebDeepLink(value)
    : isApprovedAppDeepLink(value);
};

export const safeDeepLinkSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    isSafeDeepLink,
    "Expected an approved Web or huoqiu App registry deep link",
  );
export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/\p{Cc}/u.test(value));
export const cursorQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const commonErrorResponses = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  429: apiErrorSchema,
  503: apiErrorSchema,
} as const;

export const createListResponseSchema = <ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) =>
  requestMetaSchema.extend({
    items: z.array(itemSchema),
    next_cursor: cursorSchema.nullable(),
  });
