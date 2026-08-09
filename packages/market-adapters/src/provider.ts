import type { CursorPage } from "@huoqiu/contracts/shared/page";
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

const parseVersion = (
  value: string,
  field: "sequence" | "revision",
): bigint => {
  if (!INT64_PATTERN.test(value)) {
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
): QuoteObservationState => ({
  listing_id: listingId,
  current: null,
  history: [],
});

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
