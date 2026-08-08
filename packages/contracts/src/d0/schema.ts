import { z } from "zod";

import { feedCardV1Schema } from "@huoqiu/contracts/feed/card-v1";

const STABLE_ID_PATTERN = /^[a-z][a-z0-9_]*$/u;
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9]{1,15}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/u;
const SIGNED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/u;

const stableIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(STABLE_ID_PATTERN, "Expected a stable public identifier");
const boundedTextSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value, {
    message: "Public text must not have surrounding whitespace",
  })
  .refine((value) => !/\p{Cc}/u.test(value), {
    message: "Public text must not contain control characters",
  });
const decimalStringSchema = z.string().regex(DECIMAL_PATTERN);
const signedDecimalStringSchema = z.string().regex(SIGNED_DECIMAL_PATTERN);
const isoInstantSchema = z.iso.datetime({ offset: true });

const decimalToScaledInteger = (value: string): bigint => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
};

const instrumentSchema = z
  .object({
    instrument_id: stableIdSchema,
    listing_id: stableIdSchema,
    symbol: z.string().regex(SYMBOL_PATTERN),
    name: boundedTextSchema,
    pinyin: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z]+$/u),
    aliases: z.array(boundedTextSchema).min(1).max(12),
    market: z.enum(["CN", "HK", "US"]),
    currency: z.enum(["CNY", "HKD", "USD"]),
    status: z.enum(["open", "closed", "halted"]),
  })
  .strict();

const quoteSchema = z
  .object({
    listing_id: stableIdSchema,
    last: decimalStringSchema,
    change: signedDecimalStringSchema,
    change_pct: signedDecimalStringSchema,
    source: z.literal("huoqiu-synthetic"),
    as_of: isoInstantSchema,
    stale: z.literal(false),
    entitlement: z.literal("synthetic"),
  })
  .strict();

const barPointSchema = z
  .object({
    at: isoInstantSchema,
    open: decimalStringSchema,
    high: decimalStringSchema,
    low: decimalStringSchema,
    close: decimalStringSchema,
    volume: decimalStringSchema,
  })
  .strict()
  .superRefine((point, context) => {
    const open = decimalToScaledInteger(point.open);
    const high = decimalToScaledInteger(point.high);
    const low = decimalToScaledInteger(point.low);
    const close = decimalToScaledInteger(point.close);

    if (high < open || high < low || high < close) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "High must be at least open, low, and close",
      });
    }
    if (low > open || low > high || low > close) {
      context.addIssue({
        code: "custom",
        path: ["low"],
        message: "Low must be at most open, high, and close",
      });
    }
  });

const barSeriesSchema = z
  .object({
    listing_id: stableIdSchema,
    interval: z.literal("1d"),
    points: z.array(barPointSchema).length(20),
  })
  .strict()
  .superRefine((series, context) => {
    for (let index = 1; index < series.points.length; index += 1) {
      const previous = series.points[index - 1];
      const current = series.points[index];
      if (previous !== undefined && current !== undefined) {
        if (current.at <= previous.at) {
          context.addIssue({
            code: "custom",
            path: ["points", index, "at"],
            message: "Bar timestamps must be strictly increasing",
          });
        }
      }
    }
  });

const findDuplicates = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
};

const sameMembers = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
  left.size === right.size && [...left].every((value) => right.has(value));

export const d0FixtureSchema = z
  .object({
    version: z.literal("d0.v1"),
    mode: z.literal("fixture"),
    seed_user: z
      .object({
        id: z.literal("user_demo_0001"),
        name: z.literal("演示用户"),
        avatar_key: z.literal("demo-avatar"),
      })
      .strict(),
    market: z
      .object({
        source: z.literal("huoqiu-synthetic"),
        as_of: isoInstantSchema,
      })
      .strict(),
    watchlist: z
      .object({
        persistence: z.literal("session-only"),
        listing_ids: z.array(stableIdSchema).max(0),
      })
      .strict(),
    instruments: z.array(instrumentSchema).min(1).max(50),
    quotes: z.array(quoteSchema).min(1).max(50),
    bars: z.array(barSeriesSchema).min(1).max(50),
    feed: z.array(feedCardV1Schema).min(3).max(50),
  })
  .strict()
  .superRefine((fixture, context) => {
    const instrumentIds = fixture.instruments.map(
      (instrument) => instrument.instrument_id,
    );
    const listingIds = fixture.instruments.map(
      (instrument) => instrument.listing_id,
    );
    const listingIdSet = new Set(listingIds);
    const quoteListingIds = fixture.quotes.map((quote) => quote.listing_id);
    const barListingIds = fixture.bars.map((series) => series.listing_id);

    for (const duplicate of findDuplicates(instrumentIds)) {
      context.addIssue({
        code: "custom",
        path: ["instruments"],
        message: `Duplicate instrument_id: ${duplicate}`,
      });
    }
    for (const duplicate of findDuplicates(listingIds)) {
      context.addIssue({
        code: "custom",
        path: ["instruments"],
        message: `Duplicate listing_id: ${duplicate}`,
      });
    }
    for (const duplicate of findDuplicates(quoteListingIds)) {
      context.addIssue({
        code: "custom",
        path: ["quotes"],
        message: `Duplicate quote listing_id: ${duplicate}`,
      });
    }
    for (const duplicate of findDuplicates(barListingIds)) {
      context.addIssue({
        code: "custom",
        path: ["bars"],
        message: `Duplicate bar listing_id: ${duplicate}`,
      });
    }
    if (!sameMembers(listingIdSet, new Set(quoteListingIds))) {
      context.addIssue({
        code: "custom",
        path: ["quotes"],
        message: "Quotes must reference every and only declared listing",
      });
    }
    if (!sameMembers(listingIdSet, new Set(barListingIds))) {
      context.addIssue({
        code: "custom",
        path: ["bars"],
        message: "Bars must reference every and only declared listing",
      });
    }
    for (const [index, quote] of fixture.quotes.entries()) {
      if (quote.as_of !== fixture.market.as_of) {
        context.addIssue({
          code: "custom",
          path: ["quotes", index, "as_of"],
          message: "Quote timestamp must equal the fixture snapshot timestamp",
        });
      }
    }
    for (const [seriesIndex, series] of fixture.bars.entries()) {
      for (const [pointIndex, point] of series.points.entries()) {
        if (point.at > fixture.market.as_of) {
          context.addIssue({
            code: "custom",
            path: ["bars", seriesIndex, "points", pointIndex, "at"],
            message: "Bar timestamp must not exceed the fixture snapshot",
          });
        }
      }
    }

    const cardIds = fixture.feed.map((card) => card.card_id);
    for (const duplicate of findDuplicates(cardIds)) {
      context.addIssue({
        code: "custom",
        path: ["feed"],
        message: `Duplicate feed card_id: ${duplicate}`,
      });
    }
    if (fixture.feed.some((card) => card.source !== "huoqiu-synthetic")) {
      context.addIssue({
        code: "custom",
        path: ["feed"],
        message: "D0 feed cards must use the synthetic source",
      });
    }
    if (!fixture.feed.some((card) => card.type === "market_strip")) {
      context.addIssue({
        code: "custom",
        path: ["feed"],
        message: "D0 feed must include a market strip",
      });
    }
  });

export type D0Fixture = z.infer<typeof d0FixtureSchema>;
