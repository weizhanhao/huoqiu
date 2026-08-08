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

export const apiErrorCodeSchema = z.enum(errorCodes);

const publicAliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/u, "Expected a bounded public alias");

const boundedPublicTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/\p{Cc}/u.test(value), {
    message: "Public error text must not contain control characters",
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
