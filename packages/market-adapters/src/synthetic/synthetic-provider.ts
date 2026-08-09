import { createHmac, timingSafeEqual } from "node:crypto";

import type { Cursor, CursorPage } from "@huoqiu/contracts/shared/page";
import type { ListingId } from "@huoqiu/domain/shared/ids";

import {
  SYNTHETIC_MARKET_SOURCE,
  type MarketDataProvider,
  type NormalizedBar,
  type NormalizedQuote,
} from "../provider.js";
import {
  generateSyntheticBar,
  generateSyntheticQuote,
  shiftTradingDays,
  tradingDayFromInstant,
} from "./generator.js";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_HISTORY_SIZE = 60;
const MAX_PAGE_SIZE = 100;
const MAX_HISTORY_SIZE = 10_000;
const MAX_SEED_LENGTH = 256;
const MAX_CURSOR_LENGTH = 512;
const EXCHANGE_TIMEZONE_PATTERN =
  /^(?:UTC|GMT|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/u;
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;
const LISTING_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface SyntheticMarketDataProviderOptions {
  readonly seed: string;
  readonly clock: () => string;
  readonly exchangeTimezone?: string;
  readonly pageSize?: number;
  readonly historySize?: number;
}

interface CursorPayload {
  readonly version: 1;
  readonly listing_id: string;
  readonly interval: "1d";
  readonly anchor_as_of: string;
  readonly offset: number;
  readonly history_size: number;
}

const boundedIntegerOption = (
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return resolved;
};

const canonicalInstant = (value: string): string => {
  if (typeof value !== "string" || !EXPLICIT_OFFSET_PATTERN.test(value)) {
    throw new TypeError(
      "snapshot must be an ISO instant with an explicit offset",
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    throw new RangeError("snapshot instant is not a valid calendar instant");
  }
  return new Date(epoch).toISOString();
};

const assertListingId = (listingId: ListingId): void => {
  if (typeof listingId !== "string" || !LISTING_ID_PATTERN.test(listingId)) {
    throw new TypeError("listing id must be a bounded safe opaque identifier");
  }
};

const decodeJson = (encoded: string): unknown => {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new TypeError("synthetic market cursor is invalid");
  }
};

const parseCursorPayload = (value: unknown): CursorPayload => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("synthetic market cursor payload is invalid");
  }
  const payload = value as Record<string, unknown>;
  const exactKeys = [
    "version",
    "listing_id",
    "interval",
    "anchor_as_of",
    "offset",
    "history_size",
  ];
  if (
    Object.keys(payload).length !== exactKeys.length ||
    exactKeys.some((key) => !(key in payload)) ||
    payload.version !== 1 ||
    typeof payload.listing_id !== "string" ||
    payload.interval !== "1d" ||
    typeof payload.anchor_as_of !== "string" ||
    !Number.isSafeInteger(payload.offset) ||
    (payload.offset as number) < 1 ||
    !Number.isSafeInteger(payload.history_size) ||
    (payload.history_size as number) < 1 ||
    (payload.history_size as number) > MAX_HISTORY_SIZE
  ) {
    throw new TypeError("synthetic market cursor payload is invalid");
  }
  return payload as unknown as CursorPayload;
};

export class SyntheticMarketDataProvider implements MarketDataProvider {
  readonly source = SYNTHETIC_MARKET_SOURCE;

  readonly #seed: string;
  readonly #clock: () => string;
  readonly #exchangeTimezone: string;
  readonly #pageSize: number;
  readonly #historySize: number;

  constructor(options: SyntheticMarketDataProviderOptions) {
    if (
      typeof options.seed !== "string" ||
      options.seed.length < 1 ||
      options.seed.length > MAX_SEED_LENGTH ||
      options.seed.trim() !== options.seed ||
      /\p{Cc}/u.test(options.seed)
    ) {
      throw new RangeError(
        `seed must contain between 1 and ${MAX_SEED_LENGTH} characters`,
      );
    }
    if (typeof options.clock !== "function") {
      throw new TypeError("clock must be injected as a function");
    }
    const exchangeTimezone = options.exchangeTimezone ?? "Asia/Shanghai";
    if (!EXCHANGE_TIMEZONE_PATTERN.test(exchangeTimezone)) {
      throw new TypeError("exchangeTimezone must be UTC, GMT, or an IANA zone");
    }

    this.#seed = options.seed;
    this.#clock = options.clock;
    this.#exchangeTimezone = exchangeTimezone;
    this.#pageSize = boundedIntegerOption(
      options.pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
      "pageSize",
    );
    this.#historySize = boundedIntegerOption(
      options.historySize,
      DEFAULT_HISTORY_SIZE,
      MAX_HISTORY_SIZE,
      "historySize",
    );
  }

  async getQuote(listingId: ListingId, asOf: string): Promise<NormalizedQuote> {
    assertListingId(listingId);
    const snapshot = canonicalInstant(asOf);
    return generateSyntheticQuote({
      seed: this.#seed,
      listingId,
      tradingDay: tradingDayFromInstant(snapshot),
      asOf: snapshot,
      exchangeTimezone: this.#exchangeTimezone,
    });
  }

  async getBars(
    listingId: ListingId,
    interval: "1d",
    cursor?: string,
  ): Promise<CursorPage<NormalizedBar>> {
    assertListingId(listingId);
    if (interval !== "1d") {
      throw new TypeError("synthetic provider only supports the 1d interval");
    }

    const page =
      cursor === undefined
        ? {
            anchorAsOf: canonicalInstant(this.#clock()),
            offset: 0,
            historySize: this.#historySize,
          }
        : this.#decodeCursor(cursor, listingId, interval);
    const anchorTradingDay = tradingDayFromInstant(page.anchorAsOf);
    const end = Math.min(page.offset + this.#pageSize, page.historySize);
    const items: NormalizedBar[] = [];

    for (let index = page.offset; index < end; index += 1) {
      const tradingDay = shiftTradingDays(anchorTradingDay, -index);
      items.push(
        generateSyntheticBar({
          seed: this.#seed,
          listingId,
          tradingDay,
          asOf: page.anchorAsOf,
          exchangeTimezone: this.#exchangeTimezone,
        }),
      );
    }

    return {
      items,
      next_cursor:
        end < page.historySize
          ? this.#encodeCursor({
              version: 1,
              listing_id: listingId,
              interval,
              anchor_as_of: page.anchorAsOf,
              offset: end,
              history_size: page.historySize,
            })
          : null,
    };
  }

  #signature(encodedPayload: string): string {
    return createHmac("sha256", this.#seed)
      .update(`huoqiu-synthetic-cursor\n${encodedPayload}`)
      .digest("base64url");
  }

  #encodeCursor(payload: CursorPayload): Cursor {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
    return `syn1.${encodedPayload}.${this.#signature(encodedPayload)}` as Cursor;
  }

  #decodeCursor(
    cursor: string,
    listingId: ListingId,
    interval: "1d",
  ): Readonly<{
    anchorAsOf: string;
    offset: number;
    historySize: number;
  }> {
    if (
      typeof cursor !== "string" ||
      cursor.length < 1 ||
      cursor.length > MAX_CURSOR_LENGTH
    ) {
      throw new TypeError("synthetic market cursor is invalid");
    }
    const parts = cursor.split(".");
    if (parts.length !== 3 || parts[0] !== "syn1") {
      throw new TypeError("synthetic market cursor is invalid");
    }
    const encodedPayload = parts[1] ?? "";
    const suppliedSignature = parts[2] ?? "";
    const expectedSignature = this.#signature(encodedPayload);
    const suppliedBytes = Buffer.from(suppliedSignature, "utf8");
    const expectedBytes = Buffer.from(expectedSignature, "utf8");
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new TypeError("synthetic market cursor signature is invalid");
    }

    const payload = parseCursorPayload(decodeJson(encodedPayload));
    if (
      payload.listing_id !== listingId ||
      payload.interval !== interval ||
      payload.history_size !== this.#historySize
    ) {
      throw new TypeError("synthetic market cursor does not match this query");
    }
    if (payload.offset >= payload.history_size) {
      throw new TypeError("synthetic market cursor offset is exhausted");
    }
    return {
      anchorAsOf: canonicalInstant(payload.anchor_as_of),
      offset: payload.offset,
      historySize: payload.history_size,
    };
  }
}
