import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

const feedCardEnvelopeShape = {
  schema_version: z.literal(1),
  card_id: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z][a-z0-9_]*$/u),
  published_at: timestampSchema,
  source: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/u),
  permissions: z
    .object({
      alpha_access: z.literal(true),
      visibility: z.enum(["alpha-public", "owner", "reviewer"]),
    })
    .strict(),
} as const;

const feedTitleSchema = z.string().min(1).max(160);
const feedSummarySchema = z.string().min(1).max(500);

export const feedCardSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...feedCardEnvelopeShape,
      type: z.literal("post"),
      payload: z
        .object({
          author_id: resourceIdSchema,
          author_name: z.string().min(1).max(160),
          title: feedTitleSchema,
          body: z.string().min(1).max(10_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...feedCardEnvelopeShape,
      type: z.literal("news"),
      payload: z
        .object({
          publisher: z.string().min(1).max(160),
          title: feedTitleSchema,
          summary: feedSummarySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...feedCardEnvelopeShape,
      type: z.literal("market_strip"),
      payload: z
        .object({
          title: feedTitleSchema,
          listing_ids: z.array(resourceIdSchema).min(1).max(20),
          notice: feedSummarySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...feedCardEnvelopeShape,
      type: z.literal("topic"),
      payload: z
        .object({
          title: feedTitleSchema,
          summary: feedSummarySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...feedCardEnvelopeShape,
      type: z.literal("ops_banner"),
      payload: z
        .object({
          title: feedTitleSchema,
          body: feedSummarySchema,
        })
        .strict(),
    })
    .strict(),
]);

const watchlistItemPathSchema = z
  .object({ listingId: resourceIdSchema })
  .strict();

export const watchlistItemSchema = z
  .object({
    listing_id: resourceIdSchema,
    added_at: timestampSchema,
  })
  .strict();

export const watchlistSchema = z
  .object({
    id: resourceIdSchema,
    name: z.literal("default"),
    items: z.array(watchlistItemSchema),
  })
  .strict();

export const feedWatchlistContract = c.router({
  feedGet: {
    method: "GET",
    path: "/v1/feed",
    query: cursorQuerySchema.extend({
      channel: z.enum(["home", "following", "market", "news"]),
    }),
    responses: {
      200: createListResponseSchema(feedCardSchema),
      ...commonErrorResponses,
    },
    summary: "Read the rule-based feed",
  },
  watchlistGetDefault: {
    method: "GET",
    path: "/v1/me/watchlist",
    responses: {
      200: requestMetaSchema.extend({ watchlist: watchlistSchema }),
      ...commonErrorResponses,
    },
    summary: "Read the actor's default watchlist",
  },
  watchlistPutItem: {
    method: "PUT",
    path: "/v1/me/watchlist/items/:listingId",
    pathParams: watchlistItemPathSchema,
    body: z.object({}).strict(),
    responses: {
      200: requestMetaSchema.extend({
        item: watchlistItemSchema,
        committed_version: versionStringSchema,
      }),
      ...commonErrorResponses,
    },
    summary: "Idempotently add a listing to the default watchlist",
  },
  watchlistDeleteItem: {
    method: "DELETE",
    path: "/v1/me/watchlist/items/:listingId",
    pathParams: watchlistItemPathSchema,
    body: c.noBody(),
    responses: {
      200: requestMetaSchema.extend({
        removed: z.boolean(),
        committed_version: versionStringSchema,
      }),
      ...commonErrorResponses,
    },
    summary: "Idempotently remove a listing from the default watchlist",
  },
});
