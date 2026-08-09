import { createListingId } from "@huoqiu/domain/shared/ids";
import { describe, expect, it } from "vitest";

import {
  applyQuoteObservation,
  createQuoteObservationState,
  type NormalizedQuote,
} from "../src/provider.js";

const listingId = createListingId("listing_syn_0001");

const quote = (
  sequence: string,
  revision: string,
  price = "101.25",
): NormalizedQuote => ({
  listing_id: listingId,
  price,
  change: "1.25",
  change_percent: "1.25",
  stale: false,
  source: "huoqiu-synthetic",
  as_of: "2026-08-08T06:00:00.000Z",
  exchange_timezone: "Asia/Shanghai",
  sequence,
  revision,
  entitlement: "synthetic",
});

describe("synthetic quote sequence and revision reduction", () => {
  it("does not let an older sequence overwrite the current quote", () => {
    const first = applyQuoteObservation(
      createQuoteObservationState(listingId),
      quote("20", "0", "120"),
    );
    const older = applyQuoteObservation(first.state, quote("19", "0", "90"));

    expect(older.accepted).toBe(false);
    expect(older.reason).toBe("stale_sequence");
    expect(older.state.current?.price).toBe("120");
    expect(older.state.history.map((item) => item.sequence)).toEqual([
      "20",
      "19",
    ]);
    expect(older.revision_notices).toEqual([]);

    const duplicateOlder = applyQuoteObservation(
      older.state,
      quote("19", "0", "90"),
    );
    expect(duplicateOlder.reason).toBe("duplicate");
    expect(duplicateOlder.state.history).toHaveLength(2);
  });

  it("retains both observations and emits one revision notice for a higher revision", () => {
    const initial = applyQuoteObservation(
      createQuoteObservationState(listingId),
      quote("20", "0", "120"),
    );
    const revised = applyQuoteObservation(
      initial.state,
      quote("20", "1", "121"),
    );

    expect(revised.accepted).toBe(true);
    expect(revised.reason).toBe("higher_revision");
    expect(revised.state.current?.price).toBe("121");
    expect(revised.state.history.map((item) => item.price)).toEqual([
      "120",
      "121",
    ]);
    expect(revised.revision_notices).toEqual([
      {
        event_type: "market.quote_revised",
        payload: {
          listing_id: listingId,
          sequence: "20",
          revision: "1",
          as_of: "2026-08-08T06:00:00.000Z",
        },
      },
    ]);

    const duplicate = applyQuoteObservation(
      revised.state,
      quote("20", "1", "121"),
    );
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.reason).toBe("duplicate");
    expect(duplicate.state.history).toHaveLength(2);
    expect(duplicate.revision_notices).toEqual([]);
  });

  it("rejects ambiguous same-version content and invalid int64 versions", () => {
    const initial = applyQuoteObservation(
      createQuoteObservationState(listingId),
      quote("20", "0", "120"),
    );

    expect(() =>
      applyQuoteObservation(initial.state, quote("20", "0", "999")),
    ).toThrow("conflicting");
    expect(() =>
      applyQuoteObservation(initial.state, quote("-1", "0")),
    ).toThrow("sequence");
    expect(() =>
      applyQuoteObservation(initial.state, quote("20", "9223372036854775808")),
    ).toThrow("revision");
  });

  it("emits a revision notice for a historical sequence without replacing the latest quote", () => {
    const sequence19 = applyQuoteObservation(
      createQuoteObservationState(listingId),
      quote("19", "0", "90"),
    );
    const sequence20 = applyQuoteObservation(
      sequence19.state,
      quote("20", "0", "120"),
    );
    const historicalRevision = applyQuoteObservation(
      sequence20.state,
      quote("19", "1", "91"),
    );

    expect(historicalRevision.accepted).toBe(false);
    expect(historicalRevision.reason).toBe("historical_revision");
    expect(historicalRevision.state.current?.sequence).toBe("20");
    expect(historicalRevision.state.current?.price).toBe("120");
    expect(historicalRevision.state.history).toHaveLength(3);
    expect(historicalRevision.revision_notices).toHaveLength(1);
    expect(historicalRevision.revision_notices[0]?.payload).toMatchObject({
      listing_id: listingId,
      sequence: "19",
      revision: "1",
    });
  });

  it("rejects cross-listing state contamination", () => {
    const other = quote("21", "0");

    expect(() =>
      applyQuoteObservation(
        createQuoteObservationState(createListingId("listing_syn_other")),
        other,
      ),
    ).toThrow("listing");
  });
});
