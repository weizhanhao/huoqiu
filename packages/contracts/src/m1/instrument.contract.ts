import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  decimalStringSchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

const listingPathSchema = z.object({ id: resourceIdSchema }).strict();

const exchangeTimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^(?:UTC|GMT|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/u,
    "Expected an IANA exchange timezone",
  );

const syntheticProviderProvenanceShape = {
  source: z.literal("huoqiu-synthetic"),
  as_of: timestampSchema,
  exchange_timezone: exchangeTimezoneSchema,
  sequence: versionStringSchema,
  revision: versionStringSchema,
  entitlement: z.literal("synthetic"),
} as const;

export const listingSchema = z
  .object({
    id: resourceIdSchema,
    instrument_id: resourceIdSchema,
    symbol: z.string().min(1).max(32),
    name: z.string().min(1).max(160),
    market: z.string().min(1).max(32),
    currency: z.string().length(3),
    status: z.enum(["active", "halted", "closed"]),
  })
  .strict();

export const quoteSchema = z
  .object({
    listing_id: resourceIdSchema,
    price: decimalStringSchema,
    change: decimalStringSchema,
    change_percent: decimalStringSchema,
    stale: z.boolean(),
    ...syntheticProviderProvenanceShape,
  })
  .strict();

export const barSchema = z
  .object({
    starts_at: timestampSchema,
    open: decimalStringSchema,
    high: decimalStringSchema,
    low: decimalStringSchema,
    close: decimalStringSchema,
    volume: decimalStringSchema,
    ...syntheticProviderProvenanceShape,
  })
  .strict();

export const instrumentContract = c.router({
  instrumentSearch: {
    method: "GET",
    path: "/v1/instruments/search",
    query: cursorQuerySchema.extend({ q: z.string().min(1).max(120) }),
    responses: {
      200: createListResponseSchema(listingSchema),
      ...commonErrorResponses,
    },
    summary: "Search the approved instrument reference catalog",
  },
  listingGet: {
    method: "GET",
    path: "/v1/listings/:id",
    pathParams: listingPathSchema,
    responses: {
      200: requestMetaSchema.extend({ listing: listingSchema }),
      ...commonErrorResponses,
    },
    summary: "Read one listing",
  },
  listingGetQuote: {
    method: "GET",
    path: "/v1/listings/:id/quote",
    pathParams: listingPathSchema,
    responses: {
      200: requestMetaSchema.extend({ quote: quoteSchema }),
      ...commonErrorResponses,
    },
    summary: "Read the latest synthetic quote",
  },
  listingGetBars: {
    method: "GET",
    path: "/v1/listings/:id/bars",
    pathParams: listingPathSchema,
    query: cursorQuerySchema.extend({
      interval: z.literal("1d"),
      adjustment: z.enum(["none", "forward", "backward"]).default("none"),
    }),
    responses: {
      200: createListResponseSchema(barSchema).extend({
        listing_id: resourceIdSchema,
      }),
      ...commonErrorResponses,
    },
    summary: "Read synthetic market bars",
  },
});
