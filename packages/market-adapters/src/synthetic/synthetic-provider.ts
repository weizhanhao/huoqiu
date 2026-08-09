import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

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
const DEFAULT_CURSOR_KEY_ID = "m1";
const MAX_PAGE_SIZE = 100;
const MAX_HISTORY_SIZE = 10_000;
const MAX_SEED_LENGTH = 256;
const MAX_CURSOR_LENGTH = 512;
const CURSOR_NONCE_LENGTH = 12;
const CURSOR_TAG_LENGTH = 16;
const EXCHANGE_TIMEZONE_PATTERN =
  /^(?:UTC|GMT|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/u;
const LISTING_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CURSOR_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const SEED_FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

export interface SyntheticMarketDataProviderOptions {
  readonly seed: string;
  readonly cursorEncryptionKey: Uint8Array;
  readonly cursorKeyId?: string;
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
  readonly exchange_timezone: string;
  readonly seed_fingerprint: string;
}

type CursorPayloadTuple = readonly [
  version: 1,
  listingId: string,
  interval: "1d",
  anchorAsOf: string,
  offset: number,
  historySize: number,
  exchangeTimezone: string,
  seedFingerprint: string,
];

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

const invalidInstant = (): never => {
  throw new TypeError("snapshot instant must be a valid RFC3339 timestamp");
};

const utcEpochForCalendarParts = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number => {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, second, millisecond);
  return value.getTime();
};

const canonicalInstant = (value: string): string => {
  if (typeof value !== "string") {
    return invalidInstant();
  }
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) {
    return invalidInstant();
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText,
    offsetText,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((fractionText ?? "").padEnd(3, "0") || "0");
  const offsetHour = offsetText === "Z" ? 0 : Number(offsetHourText);
  const offsetMinute = offsetText === "Z" ? 0 : Number(offsetMinuteText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return invalidInstant();
  }

  const localEpoch = utcEpochForCalendarParts(
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const roundTrip = new Date(localEpoch);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second ||
    roundTrip.getUTCMilliseconds() !== millisecond
  ) {
    return invalidInstant();
  }

  const offsetDirection = offsetSign === "-" ? -1 : 1;
  const offsetMilliseconds =
    offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  const epoch = localEpoch - offsetMilliseconds;
  if (!Number.isFinite(epoch)) {
    return invalidInstant();
  }
  try {
    return new Date(epoch).toISOString();
  } catch {
    return invalidInstant();
  }
};

const assertListingId = (listingId: ListingId): void => {
  if (typeof listingId !== "string" || !LISTING_ID_PATTERN.test(listingId)) {
    throw new TypeError("listing id must be a bounded safe opaque identifier");
  }
};

const assertExchangeTimezone: (value: unknown) => asserts value is string = (
  value,
) => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    value.trim() !== value ||
    !EXCHANGE_TIMEZONE_PATTERN.test(value)
  ) {
    throw new TypeError("exchangeTimezone must be UTC, GMT, or an IANA zone");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
  } catch {
    throw new TypeError("exchangeTimezone must name a real IANA zone");
  }
};

const parseCursorPayload = (value: unknown): CursorPayload => {
  if (!Array.isArray(value) || value.length !== 8) {
    throw new TypeError("synthetic market cursor payload is invalid");
  }
  const [
    version,
    listingId,
    interval,
    anchorAsOf,
    offset,
    historySize,
    exchangeTimezone,
    seedFingerprint,
  ] = value as unknown as CursorPayloadTuple;
  if (
    version !== 1 ||
    typeof listingId !== "string" ||
    !LISTING_ID_PATTERN.test(listingId) ||
    interval !== "1d" ||
    typeof anchorAsOf !== "string" ||
    !Number.isSafeInteger(offset) ||
    offset < 1 ||
    !Number.isSafeInteger(historySize) ||
    historySize < 1 ||
    historySize > MAX_HISTORY_SIZE ||
    typeof exchangeTimezone !== "string" ||
    exchangeTimezone.length > 64 ||
    !EXCHANGE_TIMEZONE_PATTERN.test(exchangeTimezone) ||
    typeof seedFingerprint !== "string" ||
    !SEED_FINGERPRINT_PATTERN.test(seedFingerprint)
  ) {
    throw new TypeError("synthetic market cursor payload is invalid");
  }
  return {
    version,
    listing_id: listingId,
    interval,
    anchor_as_of: anchorAsOf,
    offset,
    history_size: historySize,
    exchange_timezone: exchangeTimezone,
    seed_fingerprint: seedFingerprint,
  };
};

const constantTimeTextMatches = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const deriveCursorSubkey = (masterKey: Uint8Array, purpose: string): Buffer =>
  createHmac("sha256", masterKey)
    .update(`huoqiu-synthetic-cursor-v1\n${purpose}`)
    .digest();

export class SyntheticMarketDataProvider implements MarketDataProvider {
  readonly source = SYNTHETIC_MARKET_SOURCE;

  readonly #seed: string;
  readonly #clock: () => string;
  readonly #exchangeTimezone: string;
  readonly #pageSize: number;
  readonly #historySize: number;
  readonly #cursorKeyId: string;
  readonly #cursorEncryptionKey: Buffer;
  readonly #cursorNonceKey: Buffer;
  readonly #seedFingerprint: string;

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
    if (
      !(options.cursorEncryptionKey instanceof Uint8Array) ||
      options.cursorEncryptionKey.byteLength !== 32 ||
      options.cursorEncryptionKey.every(
        (byte) => byte === options.cursorEncryptionKey[0],
      )
    ) {
      throw new RangeError(
        "cursorEncryptionKey must be a non-degenerate 32-byte key",
      );
    }
    if (typeof options.clock !== "function") {
      throw new TypeError("clock must be injected as a function");
    }
    const exchangeTimezone = options.exchangeTimezone ?? "Asia/Shanghai";
    assertExchangeTimezone(exchangeTimezone);
    const cursorKeyId = options.cursorKeyId ?? DEFAULT_CURSOR_KEY_ID;
    if (!CURSOR_KEY_ID_PATTERN.test(cursorKeyId)) {
      throw new TypeError("cursorKeyId must be a bounded opaque key id");
    }

    const masterKey = Uint8Array.from(options.cursorEncryptionKey);
    this.#seed = options.seed;
    this.#clock = options.clock;
    this.#exchangeTimezone = exchangeTimezone;
    this.#cursorKeyId = cursorKeyId;
    this.#cursorEncryptionKey = deriveCursorSubkey(masterKey, "encryption");
    this.#cursorNonceKey = deriveCursorSubkey(masterKey, "nonce");
    this.#seedFingerprint = createHmac("sha256", masterKey)
      .update(`huoqiu-synthetic-seed-v1\n${options.seed}`)
      .digest("base64url");
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
      tradingDay: tradingDayFromInstant(snapshot, this.#exchangeTimezone),
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
    const anchorTradingDay = tradingDayFromInstant(
      page.anchorAsOf,
      this.#exchangeTimezone,
    );
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
              exchange_timezone: this.#exchangeTimezone,
              seed_fingerprint: this.#seedFingerprint,
            })
          : null,
    };
  }

  #cursorAad(): Buffer {
    return Buffer.from(
      `huoqiu-synthetic-cursor\nv1\n${this.#cursorKeyId}`,
      "utf8",
    );
  }

  #payloadBytes(payload: CursorPayload): Buffer {
    const tuple: CursorPayloadTuple = [
      payload.version,
      payload.listing_id,
      payload.interval,
      payload.anchor_as_of,
      payload.offset,
      payload.history_size,
      payload.exchange_timezone,
      payload.seed_fingerprint,
    ];
    return Buffer.from(JSON.stringify(tuple), "utf8");
  }

  #cursorNonce(plaintext: Uint8Array): Buffer {
    return createHmac("sha256", this.#cursorNonceKey)
      .update(this.#cursorAad())
      .update("\n")
      .update(plaintext)
      .digest()
      .subarray(0, CURSOR_NONCE_LENGTH);
  }

  #encodeCursor(payload: CursorPayload): Cursor {
    const plaintext = this.#payloadBytes(payload);
    const nonce = this.#cursorNonce(plaintext);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.#cursorEncryptionKey,
      nonce,
    );
    cipher.setAAD(this.#cursorAad());
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const token = `syn1.${this.#cursorKeyId}.${Buffer.concat([
      nonce,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64url")}`;
    if (token.length > MAX_CURSOR_LENGTH) {
      throw new RangeError("synthetic market cursor exceeds contract bounds");
    }
    return token as Cursor;
  }

  #decryptCursor(encodedCiphertext: string): CursorPayload {
    if (!BASE64URL_PATTERN.test(encodedCiphertext)) {
      throw new TypeError("synthetic market cursor is invalid");
    }
    const bytes = Buffer.from(encodedCiphertext, "base64url");
    if (
      bytes.length <= CURSOR_NONCE_LENGTH + CURSOR_TAG_LENGTH ||
      bytes.toString("base64url") !== encodedCiphertext
    ) {
      throw new TypeError("synthetic market cursor is invalid");
    }
    const nonce = bytes.subarray(0, CURSOR_NONCE_LENGTH);
    const tag = bytes.subarray(
      CURSOR_NONCE_LENGTH,
      CURSOR_NONCE_LENGTH + CURSOR_TAG_LENGTH,
    );
    const ciphertext = bytes.subarray(CURSOR_NONCE_LENGTH + CURSOR_TAG_LENGTH);
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#cursorEncryptionKey,
        nonce,
      );
      decipher.setAAD(this.#cursorAad());
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      if (!timingSafeEqual(nonce, this.#cursorNonce(plaintext))) {
        throw new TypeError("synthetic market cursor nonce is invalid");
      }
      return parseCursorPayload(
        JSON.parse(plaintext.toString("utf8")) as unknown,
      );
    } catch {
      throw new TypeError("synthetic market cursor authentication failed");
    }
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
    if (
      parts.length !== 3 ||
      parts[0] !== "syn1" ||
      parts[1] !== this.#cursorKeyId
    ) {
      throw new TypeError("synthetic market cursor is invalid");
    }
    const payload = this.#decryptCursor(parts[2] ?? "");
    if (
      payload.listing_id !== listingId ||
      payload.interval !== interval ||
      payload.history_size !== this.#historySize ||
      payload.exchange_timezone !== this.#exchangeTimezone ||
      !constantTimeTextMatches(payload.seed_fingerprint, this.#seedFingerprint)
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
