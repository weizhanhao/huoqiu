import { z } from "zod4";

const MAX_NON_NEGATIVE_INT64 = "9223372036854775807";

const createBoundedUnsignedIntegerPattern = (maximum: string): RegExp => {
  if (!/^[1-9][0-9]*$/u.test(maximum)) {
    throw new TypeError("Expected a positive decimal maximum");
  }

  const alternatives = ["0"];
  if (maximum.length > 1) {
    alternatives.push(`[1-9][0-9]{0,${maximum.length - 2}}`);
  }

  let equalPrefix = "";
  for (const [index, character] of [...maximum].entries()) {
    const maximumDigit = Number(character);
    const minimumDigit = index === 0 ? 1 : 0;
    if (maximumDigit > minimumDigit) {
      const upperDigit = maximumDigit - 1;
      const digitRange =
        upperDigit === minimumDigit
          ? String(minimumDigit)
          : `[${minimumDigit}-${upperDigit}]`;
      const remainingDigits = maximum.length - index - 1;
      alternatives.push(
        `${equalPrefix}${digitRange}${
          remainingDigits === 0 ? "" : `[0-9]{${remainingDigits}}`
        }`,
      );
    }
    equalPrefix += character;
  }
  alternatives.push(maximum);
  return new RegExp(String.raw`^(?:${alternatives.join("|")})(?![\s\S])`, "u");
};

const NON_NEGATIVE_INT64_PATTERN = createBoundedUnsignedIntegerPattern(
  MAX_NON_NEGATIVE_INT64,
);

export const eventInt64StringSchema = z
  .string()
  .min(1)
  .max(19)
  .regex(NON_NEGATIVE_INT64_PATTERN, "Expected a non-negative int64 string")
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
