import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
} from "./common.js";

const c = initContract();

const feedCardSchema = z
  .object({
    type: z.enum(["post", "news", "market_strip", "topic", "ops_banner"]),
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
    payload: z.record(z.string().min(1).max(64), z.unknown()),
  })
  .strict();

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
      200: requestMetaSchema.extend({ item: watchlistItemSchema }),
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
      200: requestMetaSchema.extend({ removed: z.boolean() }),
      ...commonErrorResponses,
    },
    summary: "Idempotently remove a listing from the default watchlist",
  },
});
