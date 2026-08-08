import { z } from "zod";

const cardIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9_]*$/u, "Expected a stable public card identifier");

const cardSourceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/u, "Expected a bounded public source identifier");

export const feedCardV1Schema = z
  .object({
    type: z.enum(["post", "news", "market_strip", "topic", "ops_banner"]),
    schema_version: z.literal(1),
    card_id: cardIdSchema,
    published_at: z.iso.datetime({ offset: true }),
    source: cardSourceSchema,
    permissions: z
      .object({
        alpha_access: z.literal(true),
        visibility: z.enum(["alpha-public", "owner", "reviewer"]),
      })
      .strict(),
    payload: z.record(z.string().min(1).max(64), z.unknown()),
  })
  .strict();

export type FeedCardV1 = z.infer<typeof feedCardV1Schema>;
