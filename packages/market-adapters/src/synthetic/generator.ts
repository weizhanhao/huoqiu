import { formatDecimal } from "@huoqiu/domain/shared/decimal";
import type { ListingId } from "@huoqiu/domain/shared/ids";

import {
  SYNTHETIC_MARKET_ENTITLEMENT,
  SYNTHETIC_MARKET_SOURCE,
  type NormalizedBar,
  type NormalizedQuote,
} from "../provider.js";

const MILLISECONDS_PER_DAY = 86_400_000;
const UINT64_MASK = (1n << 64n) - 1n;
const FNV_OFFSET = 14_695_981_039_346_656_037n;
const FNV_PRIME = 1_099_511_628_211n;
const MAX_INT64 = 9_223_372_036_854_775_807n;
const TRADING_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface SyntheticGenerationContext {
  readonly seed: string;
  readonly listingId: ListingId;
  readonly tradingDay: string;
  readonly asOf: string;
  readonly exchangeTimezone: string;
  readonly revision?: string;
}

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const fnv1a64 = (value: string): bigint => {
  let hash = FNV_OFFSET;
  for (const byte of utf8(value)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash;
};

const mix64 = (value: bigint): bigint => {
  let mixed = (value + 0x9e3779b97f4a7c15n) & UINT64_MASK;
  mixed = ((mixed ^ (mixed >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
  mixed = ((mixed ^ (mixed >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
  return (mixed ^ (mixed >> 31n)) & UINT64_MASK;
};

const boundedInteger = (
  context: SyntheticGenerationContext,
  field: string,
  upperExclusive: bigint,
): bigint => {
  if (upperExclusive <= 0n) {
    throw new RangeError("upperExclusive must be positive");
  }
  const material = [
    context.seed,
    context.listingId,
    context.tradingDay,
    field,
  ].join("\u001f");
  return mix64(fnv1a64(material)) % upperExclusive;
};

const parseTradingDay = (value: string): number => {
  if (!TRADING_DAY_PATTERN.test(value)) {
    throw new TypeError("trading day must use YYYY-MM-DD");
  }
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(epoch) ||
    new Date(epoch).toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError("trading day is not a valid calendar date");
  }
  return epoch;
};

const dayFromEpoch = (epoch: number): string =>
  new Date(epoch).toISOString().slice(0, 10);

const isWeekend = (epoch: number): boolean => {
  const weekday = new Date(epoch).getUTCDay();
  return weekday === 0 || weekday === 6;
};

export const previousOrSameTradingDay = (calendarDay: string): string => {
  let epoch = parseTradingDay(calendarDay);
  while (isWeekend(epoch)) {
    epoch -= MILLISECONDS_PER_DAY;
  }
  return dayFromEpoch(epoch);
};

export const shiftTradingDays = (
  tradingDay: string,
  offset: number,
): string => {
  if (!Number.isSafeInteger(offset)) {
    throw new TypeError("trading day offset must be a safe integer");
  }
  let epoch = parseTradingDay(previousOrSameTradingDay(tradingDay));
  const direction = offset < 0 ? -1 : 1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    epoch += direction * MILLISECONDS_PER_DAY;
    if (!isWeekend(epoch)) {
      remaining -= 1;
    }
  }
  return dayFromEpoch(epoch);
};

export const tradingDayFromInstant = (instant: string): string =>
  previousOrSameTradingDay(instant.slice(0, 10));

const daySequence = (tradingDay: string): string => {
  const sequence = BigInt(
    parseTradingDay(tradingDay) / MILLISECONDS_PER_DAY + 1,
  );
  if (sequence < 0n || sequence > MAX_INT64) {
    throw new RangeError("trading day sequence exceeds int64 range");
  }
  return sequence.toString();
};

const cents = (value: bigint): string =>
  formatDecimal({ coefficient: value, scale: 2 });

const percentage = (changeInCents: bigint, previousClose: bigint): string =>
  formatDecimal({
    coefficient: (changeInCents * 1_000_000n) / previousClose,
    scale: 4,
  });

const priceCenter = (context: SyntheticGenerationContext): bigint => {
  const listingBase = 5_000n + (fnv1a64(context.listingId) % 30_000n);
  const dayNumber = BigInt(
    parseTradingDay(context.tradingDay) / MILLISECONDS_PER_DAY,
  );
  const trend = (dayNumber % 2_000n) - 1_000n;
  const noise = boundedInteger(context, "center", 801n) - 400n;
  const result = listingBase + trend + noise;
  return result > 100n ? result : 100n;
};

const priceParts = (context: SyntheticGenerationContext) => {
  const center = priceCenter(context);
  const open = center + boundedInteger(context, "open", 241n) - 120n;
  const close = center + boundedInteger(context, "close", 241n) - 120n;
  const upper =
    (open > close ? open : close) + 10n + boundedInteger(context, "high", 111n);
  const lowerCandidate =
    (open < close ? open : close) - 10n - boundedInteger(context, "low", 111n);
  const lower = lowerCandidate > 1n ? lowerCandidate : 1n;
  return { open, high: upper, low: lower, close };
};

export const generateSyntheticBar = (
  context: SyntheticGenerationContext,
): NormalizedBar => {
  const prices = priceParts(context);
  return {
    starts_at: `${context.tradingDay}T00:00:00.000Z`,
    open: cents(prices.open),
    high: cents(prices.high),
    low: cents(prices.low),
    close: cents(prices.close),
    volume: (
      100_000n + boundedInteger(context, "volume", 9_900_001n)
    ).toString(),
    source: SYNTHETIC_MARKET_SOURCE,
    as_of: context.asOf,
    exchange_timezone: context.exchangeTimezone,
    sequence: daySequence(context.tradingDay),
    revision: context.revision ?? "0",
    entitlement: SYNTHETIC_MARKET_ENTITLEMENT,
  };
};

export const generateSyntheticQuote = (
  context: SyntheticGenerationContext,
): NormalizedQuote => {
  const current = generateSyntheticBar(context);
  const previousTradingDay = shiftTradingDays(context.tradingDay, -1);
  const close = priceParts(context).close;
  const previousClose = priceParts({
    ...context,
    tradingDay: previousTradingDay,
  }).close;
  const change = close - previousClose;

  return {
    listing_id: context.listingId,
    price: current.close,
    change: cents(change),
    change_percent: percentage(change, previousClose),
    stale: false,
    source: SYNTHETIC_MARKET_SOURCE,
    as_of: context.asOf,
    exchange_timezone: context.exchangeTimezone,
    sequence: current.sequence,
    revision: current.revision,
    entitlement: SYNTHETIC_MARKET_ENTITLEMENT,
  };
};
