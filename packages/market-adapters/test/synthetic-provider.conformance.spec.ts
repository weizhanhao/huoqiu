import { readFileSync } from "node:fs";

import { m1Router } from "@huoqiu/contracts/m1";
import { createListingId } from "@huoqiu/domain/shared/ids";
import { describe, expect, it } from "vitest";

import { SyntheticMarketDataProvider } from "../src/synthetic/synthetic-provider.js";

const listingId = createListingId("listing_syn_0001");
const snapshot = "2026-08-08T06:00:00.000Z";

const createProvider = () =>
  new SyntheticMarketDataProvider({
    seed: "huoqiu-m1-seed",
    clock: () => snapshot,
    exchangeTimezone: "Asia/Shanghai",
    pageSize: 7,
    historySize: 23,
  });

describe("SyntheticMarketDataProvider conformance", () => {
  it("replays byte-identical quote and bar pages for the same seed and snapshot", async () => {
    const first = createProvider();
    const second = createProvider();

    const [firstQuote, secondQuote, firstBars, secondBars] = await Promise.all([
      first.getQuote(listingId, snapshot),
      second.getQuote(listingId, snapshot),
      first.getBars(listingId, "1d"),
      second.getBars(listingId, "1d"),
    ]);

    expect(JSON.stringify(firstQuote)).toBe(JSON.stringify(secondQuote));
    expect(JSON.stringify(firstBars)).toBe(JSON.stringify(secondBars));
  });

  it("matches the M1 quote and bar transport contracts with explicit provenance", async () => {
    const provider = createProvider();
    const quote = await provider.getQuote(listingId, snapshot);
    const bars = await provider.getBars(listingId, "1d");

    expect(() =>
      m1Router.listingGetQuote.responses[200].parse({
        request_id: "request_market_1",
        trace_id: "trace_market_1",
        quote,
      }),
    ).not.toThrow();
    expect(() =>
      m1Router.listingGetBars.responses[200].parse({
        request_id: "request_market_2",
        trace_id: "trace_market_2",
        listing_id: listingId,
        ...bars,
      }),
    ).not.toThrow();

    expect(quote).toMatchObject({
      listing_id: listingId,
      source: "huoqiu-synthetic",
      as_of: snapshot,
      exchange_timezone: "Asia/Shanghai",
      entitlement: "synthetic",
      revision: "0",
      stale: false,
    });
    expect(bars.items).toHaveLength(7);
    expect(
      bars.items.every(
        (bar) =>
          bar.source === "huoqiu-synthetic" &&
          bar.entitlement === "synthetic" &&
          bar.exchange_timezone === "Asia/Shanghai" &&
          bar.revision === "0",
      ),
    ).toBe(true);
  });

  it("paginates through a stable, complete history with listing-bound opaque cursors", async () => {
    const provider = createProvider();
    const collected: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await provider.getBars(listingId, "1d", cursor);
      collected.push(...page.items.map((bar) => bar.starts_at));
      cursor = page.next_cursor ?? undefined;
    } while (cursor !== undefined);

    expect(collected).toHaveLength(23);
    expect(new Set(collected).size).toBe(23);
    expect(collected).toEqual([...collected].sort().reverse());

    const firstPage = await provider.getBars(listingId, "1d");
    expect(firstPage.next_cursor).toMatch(
      /^syn1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u,
    );
    await expect(
      provider.getBars(
        createListingId("listing_syn_other"),
        "1d",
        firstPage.next_cursor ?? undefined,
      ),
    ).rejects.toThrow("cursor");
    await expect(
      provider.getBars(listingId, "1d", `${firstPage.next_cursor ?? ""}x`),
    ).rejects.toThrow("cursor");
  });

  it("maintains exact decimal OHLC invariants without floating point output", async () => {
    const provider = createProvider();
    const firstPage = await provider.getBars(listingId, "1d");

    for (const bar of firstPage.items) {
      const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
      expect(values.every((value) => /^-?\d+(?:\.\d+)?$/u.test(value))).toBe(
        true,
      );

      const scaled = (value: string) => {
        const [whole = "0", fraction = ""] = value.split(".");
        return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
      };
      const open = scaled(bar.open);
      const high = scaled(bar.high);
      const low = scaled(bar.low);
      const close = scaled(bar.close);
      expect(high).toBeGreaterThanOrEqual(open);
      expect(high).toBeGreaterThanOrEqual(close);
      expect(low).toBeLessThanOrEqual(open);
      expect(low).toBeLessThanOrEqual(close);
    }
  });

  it("never reads ambient randomness or the current wall clock", () => {
    const sourceFiles = [
      "../src/provider.ts",
      "../src/synthetic/generator.ts",
      "../src/synthetic/synthetic-provider.ts",
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(new URL(sourceFile, import.meta.url), "utf8");
      expect(source).not.toContain("Math.random");
      expect(source).not.toContain("Date.now");
      expect(source).not.toMatch(/new Date\(\s*\)/u);
    }
  });

  it("rejects invalid snapshots and unsupported construction bounds", async () => {
    const provider = createProvider();

    await expect(provider.getQuote(listingId, "2026-08-08")).rejects.toThrow(
      "instant",
    );
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "",
          clock: () => snapshot,
        }),
    ).toThrow("seed");
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "seed",
          clock: () => snapshot,
          pageSize: 0,
        }),
    ).toThrow("pageSize");
  });
});
