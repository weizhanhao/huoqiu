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
export const resourceIdSchema = z.string().min(1).max(128);
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
