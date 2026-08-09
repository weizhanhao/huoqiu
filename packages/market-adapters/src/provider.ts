import type { CursorPage } from "@huoqiu/contracts/shared/page";
import { m1Router } from "@huoqiu/contracts/m1";
import type { ListingId } from "@huoqiu/domain/shared/ids";

export const SYNTHETIC_MARKET_SOURCE = "huoqiu-synthetic" as const;
export const SYNTHETIC_MARKET_ENTITLEMENT = "synthetic" as const;

export interface SyntheticMarketProvenance {
  readonly source: typeof SYNTHETIC_MARKET_SOURCE;
  readonly as_of: string;
  readonly exchange_timezone: string;
  readonly sequence: string;
  readonly revision: string;
  readonly entitlement: typeof SYNTHETIC_MARKET_ENTITLEMENT;
}

export interface NormalizedQuote extends SyntheticMarketProvenance {
  readonly listing_id: ListingId;
  readonly price: string;
  readonly change: string;
  readonly change_percent: string;
  readonly stale: boolean;
}

export interface NormalizedBar extends SyntheticMarketProvenance {
  readonly starts_at: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

export interface MarketDataProvider {
  readonly source: typeof SYNTHETIC_MARKET_SOURCE;
  getQuote(listingId: ListingId, asOf: string): Promise<NormalizedQuote>;
  getBars(
    listingId: ListingId,
    interval: "1d",
    cursor?: string,
  ): Promise<CursorPage<NormalizedBar>>;
}

export interface MarketQuoteRevisedNotice {
  readonly event_type: "market.quote_revised";
  readonly payload: {
    readonly listing_id: ListingId;
    readonly sequence: string;
    readonly revision: string;
    readonly as_of: string;
  };
}

export interface QuoteObservationState {
  readonly listing_id: ListingId;
  readonly current: NormalizedQuote | null;
  readonly history: readonly NormalizedQuote[];
  readonly max_history: number;
}

export type QuoteObservationReason =
  | "initial"
  | "new_sequence"
  | "higher_revision"
  | "historical_revision"
  | "stale_sequence"
  | "stale_revision"
  | "duplicate";

export interface QuoteObservationResult {
  readonly accepted: boolean;
  readonly reason: QuoteObservationReason;
  readonly state: QuoteObservationState;
  readonly revision_notices: readonly MarketQuoteRevisedNotice[];
}

const MAX_INT64 = 9_223_372_036_854_775_807n;
const INT64_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/u;
const DEFAULT_MAX_OBSERVATION_HISTORY = 256;
const MAX_OBSERVATION_HISTORY = 4_096;
const quoteContractSchema = m1Router.listingGetQuote.responses[200].shape.quote;
const listingIdContractSchema = m1Router.listingGetQuote.pathParams.shape.id;

const parseVersion = (
  value: string,
  field: "sequence" | "revision",
): bigint => {
  if (typeof value !== "string" || !INT64_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a non-negative int64 string`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_INT64) {
    throw new RangeError(`${field} exceeds the non-negative int64 range`);
  }
  return parsed;
};

const quoteContentMatches = (
  left: NormalizedQuote,
  right: NormalizedQuote,
): boolean =>
  left.listing_id === right.listing_id &&
  left.price === right.price &&
  left.change === right.change &&
  left.change_percent === right.change_percent &&
  left.stale === right.stale &&
  left.source === right.source &&
  left.as_of === right.as_of &&
  left.exchange_timezone === right.exchange_timezone &&
  left.sequence === right.sequence &&
  left.revision === right.revision &&
  left.entitlement === right.entitlement;

const appendHistory = (
  state: QuoteObservationState,
  incoming: NormalizedQuote,
): readonly NormalizedQuote[] => [...state.history, incoming];

const revisionNotice = (
  incoming: NormalizedQuote,
): MarketQuoteRevisedNotice => ({
  event_type: "market.quote_revised",
  payload: {
    listing_id: incoming.listing_id,
    sequence: incoming.sequence,
    revision: incoming.revision,
    as_of: incoming.as_of,
  },
});

export const createQuoteObservationState = (
  listingId: ListingId,
  options: Readonly<{ maxHistory?: number }> = {},
): QuoteObservationState => {
  if (!listingIdContractSchema.safeParse(listingId).success) {
    throw new TypeError("listing id violates the authoritative M1 contract");
  }
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_OBSERVATION_HISTORY;
  if (
    !Number.isSafeInteger(maxHistory) ||
    maxHistory < 1 ||
    maxHistory > MAX_OBSERVATION_HISTORY
  ) {
    throw new RangeError(
      `maxHistory must be between 1 and ${MAX_OBSERVATION_HISTORY}`,
    );
  }
  return {
    listing_id: listingId,
    current: null,
    history: [],
    max_history: maxHistory,
  };
};

const assertRealExchangeTimezone = (value: string): void => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
  } catch {
    throw new TypeError("quote violates the authoritative M1 contract");
  }
};

const assertQuoteContract = (value: NormalizedQuote): void => {
  const result = quoteContractSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError("quote violates the authoritative M1 contract");
  }
  assertRealExchangeTimezone(result.data.exchange_timezone);
};

const assertObservationState = (state: QuoteObservationState): void => {
  if (
    typeof state !== "object" ||
    state === null ||
    !listingIdContractSchema.safeParse(state.listing_id).success ||
    !Number.isSafeInteger(state.max_history) ||
    state.max_history < 1 ||
    state.max_history > MAX_OBSERVATION_HISTORY ||
    !Array.isArray(state.history) ||
    state.history.length > state.max_history ||
    (state.current !== null && typeof state.current !== "object")
  ) {
    throw new TypeError("quote observation state violates its contract");
  }

  const versions = new Set<string>();
  for (const observation of state.history) {
    assertQuoteContract(observation);
    if (observation.listing_id !== state.listing_id) {
      throw new TypeError("quote observation state contains another listing");
    }
    const versionKey = `${observation.sequence}\u001f${observation.revision}`;
    if (versions.has(versionKey)) {
      throw new TypeError(
        "quote observation state contains duplicate versions",
      );
    }
    versions.add(versionKey);
  }

  if (state.current !== null) {
    const current = state.current;
    assertQuoteContract(current);
    if (
      current.listing_id !== state.listing_id ||
      !state.history.some((item) => quoteContentMatches(item, current))
    ) {
      throw new TypeError("current quote is absent from observation history");
    }
  }
};

/**
 * Pure ingestion semantics for a synthetic quote observation.
 *
 * This function deliberately returns a revision notice rather than publishing
 * an event itself. The market ingestion transaction owns durable observation,
 * outbox, and deduplication writes; keeping this reducer pure makes retries and
 * replay deterministic.
 */
export const applyQuoteObservation = (
  state: QuoteObservationState,
  incoming: NormalizedQuote,
): QuoteObservationResult => {
  assertObservationState(state);
  assertQuoteContract(incoming);
  if (incoming.listing_id !== state.listing_id) {
    throw new TypeError(
      "quote listing does not match observation state listing",
    );
  }

  const incomingSequence = parseVersion(incoming.sequence, "sequence");
  const incomingRevision = parseVersion(incoming.revision, "revision");
  const current = state.current;

  const sameVersion = state.history.find(
    (observation) =>
      observation.sequence === incoming.sequence &&
      observation.revision === incoming.revision,
  );
  if (sameVersion !== undefined) {
    if (!quoteContentMatches(sameVersion, incoming)) {
      throw new Error(
        "conflicting quote content for the same sequence and revision",
      );
    }
    return {
      accepted: false,
      reason: "duplicate",
      state,
      revision_notices: [],
    };
  }

  if (state.history.length >= state.max_history) {
    throw new RangeError(
      "quote observation history capacity reached; persist before accepting more",
    );
  }

  if (current === null) {
    return {
      accepted: true,
      reason: "initial",
      state: {
        ...state,
        current: incoming,
        history: appendHistory(state, incoming),
      },
      revision_notices: [],
    };
  }

  const currentSequence = parseVersion(current.sequence, "sequence");
  const currentRevision = parseVersion(current.revision, "revision");

  const history = appendHistory(state, incoming);
  if (incomingSequence < currentSequence) {
    const highestKnownRevision = state.history.reduce<bigint | null>(
      (highest, observation) => {
        if (observation.sequence !== incoming.sequence) {
          return highest;
        }
        const revision = parseVersion(observation.revision, "revision");
        return highest === null || revision > highest ? revision : highest;
      },
      null,
    );
    if (
      highestKnownRevision !== null &&
      incomingRevision > highestKnownRevision
    ) {
      return {
        accepted: false,
        reason: "historical_revision",
        state: { ...state, history },
        revision_notices: [revisionNotice(incoming)],
      };
    }
    return {
      accepted: false,
      reason:
        highestKnownRevision === null ? "stale_sequence" : "stale_revision",
      state: { ...state, history },
      revision_notices: [],
    };
  }
  if (incomingSequence > currentSequence) {
    return {
      accepted: true,
      reason: "new_sequence",
      state: { ...state, current: incoming, history },
      revision_notices: [],
    };
  }
  if (incomingRevision < currentRevision) {
    return {
      accepted: false,
      reason: "stale_revision",
      state: { ...state, history },
      revision_notices: [],
    };
  }

  return {
    accepted: true,
    reason: "higher_revision",
    state: { ...state, current: incoming, history },
    revision_notices: [revisionNotice(incoming)],
  };
};
