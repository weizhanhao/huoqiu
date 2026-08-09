import { z } from "zod4";

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

export const apiErrorCodeSchema = z.enum(errorCodes);

const sensitivePublicContentPatterns = [
  /(?:^|\s)at\s+(?:async\s+)?(?:[^()\s]+\s+\()?(?:(?:file:\/\/)?\/|[A-Za-z]:\\)[^)\r\n]+:\d+:\d+\)?/u,
  /\bselect\s+(?:(?:\*|[A-Za-z_][A-Za-z0-9_.]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_.]*)+)\s+from\s+[A-Za-z_][A-Za-z0-9_.]*(?=\s*(?:where\b|join\b|order\s+by\b|group\s+by\b|limit\b|;|$))|[A-Za-z_][A-Za-z0-9_.]*\s+from\s+[A-Za-z_][A-Za-z0-9_.]*(?=\s*(?:where\b|join\b|order\s+by\b|group\s+by\b|limit\b|;)))/iu,
  /\binsert\s+into\s+[A-Za-z_][A-Za-z0-9_.]*\s*(?:\([^)\r\n]{1,128}\)\s*)?values\s*\(/iu,
  /\bupdate\s+[A-Za-z_][A-Za-z0-9_.]*\s+set\s+[A-Za-z_][A-Za-z0-9_.]*\s*=/iu,
  /\bdelete\s+from\s+[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?=\s*(?:where\b|;))/iu,
  /(?:^|[\s("'=:[{])\/(?:srv|app|home|users|var|etc|opt|tmp)\/[^\s"'<>]+/iu,
  /(?:^|[\s("'=:[{])[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]+/u,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /\beyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]{2,}){0,2}\b/u,
  /\b(?:sk_live_|sk_test_)[A-Za-z0-9_-]+\b/iu,
  /\bAKIA[A-Z0-9]{8,}\b/u,
  /\bghp_[A-Za-z0-9]+\b/u,
  /\b(?:token|api[_-]?key|secret|password)\s*=\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;]+)/iu,
] as const;

const isSafePublicContent = (value: string): boolean =>
  sensitivePublicContentPatterns.every((pattern) => !pattern.test(value));

const publicAliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/u, "Expected a bounded public alias")
  .refine(isSafePublicContent, {
    message: "Public alias must not contain sensitive content",
  });

const boundedPublicTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0, {
    message: "Public error text must not be blank",
  })
  .refine((value) => !/\p{Cc}/u.test(value), {
    message: "Public error text must not contain control characters",
  })
  .refine(isSafePublicContent, {
    message: "Public error text must not contain sensitive content",
  });

const traceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u, "Expected a bounded trace identifier");

export const apiErrorDetailsSchema = z
  .object({
    field: publicAliasSchema.optional(),
    constraint: publicAliasSchema.optional(),
    retry_after: z.number().int().min(0).max(86_400).optional(),
    conflict_version: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,19})$/u, "Expected a non-negative version")
      .optional(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: apiErrorCodeSchema,
    message: boundedPublicTextSchema,
    details: apiErrorDetailsSchema,
    trace_id: traceIdSchema,
  })
  .strict();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
