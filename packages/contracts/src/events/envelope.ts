import { z } from "zod4";

const MAX_NON_NEGATIVE_INT64 = "9223372036854775807";
const NON_NEGATIVE_INT64_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/u;

const isNonNegativeInt64String = (value: string): boolean =>
  NON_NEGATIVE_INT64_PATTERN.test(value) &&
  (value.length < MAX_NON_NEGATIVE_INT64.length ||
    value <= MAX_NON_NEGATIVE_INT64);

export const eventInt64StringSchema = z
  .string()
  .min(1)
  .max(19)
  .regex(NON_NEGATIVE_INT64_PATTERN, "Expected a non-negative int64 string")
  .refine(isNonNegativeInt64String, {
    message: "Expected a non-negative int64 string",
  })
  .meta({
    "x-int64-maximum": MAX_NON_NEGATIVE_INT64,
    "x-int64-minimum": "0",
    "x-int64-string": true,
  });

export const eventResourceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    "Expected a safe opaque resource identifier",
  );

export const eventTimestampSchema = z.iso.datetime({ offset: true });

export const eventProducerSchema = z.enum([
  "identity",
  "content",
  "social",
  "moderation",
  "watchlist",
  "notification",
  "portfolio",
  "market",
]);

export const eventEnvelopeSchema = z
  .object({
    event_id: z.uuid(),
    event_type: z.string().min(1).max(128),
    version: z.literal(1),
    occurred_at: eventTimestampSchema,
    producer: eventProducerSchema,
    aggregate_id: eventResourceIdSchema,
    sequence: eventInt64StringSchema,
    trace_id: eventResourceIdSchema,
    payload: z.unknown(),
  })
  .strict();

export type EventProducer = z.infer<typeof eventProducerSchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
