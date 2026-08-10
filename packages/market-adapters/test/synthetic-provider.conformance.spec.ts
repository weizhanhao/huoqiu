import { readFileSync } from "node:fs";

import { m1Router } from "@huoqiu/contracts/m1";
import { createListingId } from "@huoqiu/domain/shared/ids";
import { describe, expect, it } from "vitest";

import { SyntheticMarketDataProvider } from "../src/synthetic/synthetic-provider.js";

const listingId = createListingId("listing_syn_0001");
const snapshot = "2026-08-08T06:00:00.000Z";
const cursorEncryptionKey = Uint8Array.from(
  { length: 32 },
  (_, index) => index + 1,
);

const createProvider = () =>
  new SyntheticMarketDataProvider({
    seed: "huoqiu-m1-seed",
    cursorEncryptionKey,
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
    expect(quote.price).toBe(bars.items[0]?.close);
    expect(quote.sequence).toBe(bars.items[0]?.sequence);
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
      /^syn1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+$/u,
    );
    const encryptedPayload = firstPage.next_cursor?.split(".")[2] ?? "";
    const decodedCiphertext = Buffer.from(
      encryptedPayload,
      "base64url",
    ).toString("utf8");
    expect(decodedCiphertext).not.toContain(listingId);
    expect(decodedCiphertext).not.toContain(snapshot);
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

  it("binds continuation pages to their original clock snapshot", async () => {
    let clockValue = snapshot;
    const provider = new SyntheticMarketDataProvider({
      seed: "stable-clock-seed",
      cursorEncryptionKey,
      clock: () => clockValue,
      pageSize: 3,
      historySize: 6,
    });
    const first = await provider.getBars(listingId, "1d");
    clockValue = "2027-08-08T06:00:00.000Z";
    const continuation = await provider.getBars(
      listingId,
      "1d",
      first.next_cursor ?? undefined,
    );

    expect(continuation.items.every((bar) => bar.as_of === snapshot)).toBe(
      true,
    );
    expect(continuation.items[0]?.starts_at).toBe("2026-08-03T16:00:00.000Z");
  });

  it("binds cursors to the configured seed", async () => {
    const first = createProvider();
    const cursor = (await first.getBars(listingId, "1d")).next_cursor;
    const differentSeed = new SyntheticMarketDataProvider({
      seed: "different-seed",
      cursorEncryptionKey,
      clock: () => snapshot,
      pageSize: 7,
      historySize: 23,
    });

    await expect(
      differentSeed.getBars(listingId, "1d", cursor ?? undefined),
    ).rejects.toThrow("cursor");
  });

  it("binds encrypted cursors to the exchange timezone", async () => {
    const shanghai = createProvider();
    const cursor = (await shanghai.getBars(listingId, "1d")).next_cursor;
    const newYork = new SyntheticMarketDataProvider({
      seed: "huoqiu-m1-seed",
      cursorEncryptionKey,
      clock: () => snapshot,
      exchangeTimezone: "America/New_York",
      pageSize: 7,
      historySize: 23,
    });

    await expect(
      newYork.getBars(listingId, "1d", cursor ?? undefined),
    ).rejects.toThrow("cursor");
  });

  it("uses the exchange-local calendar day and local midnight", async () => {
    const newYork = new SyntheticMarketDataProvider({
      seed: "timezone-seed",
      cursorEncryptionKey,
      clock: () => "2026-08-10T02:00:00.000Z",
      exchangeTimezone: "America/New_York",
      pageSize: 1,
      historySize: 1,
    });
    const shanghai = new SyntheticMarketDataProvider({
      seed: "timezone-seed",
      cursorEncryptionKey,
      clock: () => "2026-08-09T16:30:00.000Z",
      exchangeTimezone: "Asia/Shanghai",
      pageSize: 1,
      historySize: 1,
    });

    expect((await newYork.getBars(listingId, "1d")).items[0]?.starts_at).toBe(
      "2026-08-07T04:00:00.000Z",
    );
    expect((await shanghai.getBars(listingId, "1d")).items[0]?.starts_at).toBe(
      "2026-08-09T16:00:00.000Z",
    );
  });

  it("uses the first representable local instant when DST skips midnight", async () => {
    const cairo = new SyntheticMarketDataProvider({
      seed: "dst-midnight-seed",
      cursorEncryptionKey,
      clock: () => "2024-04-26T12:00:00.000Z",
      exchangeTimezone: "Africa/Cairo",
      pageSize: 1,
      historySize: 1,
    });

    expect((await cairo.getBars(listingId, "1d")).items[0]?.starts_at).toBe(
      "2024-04-25T22:00:00.000Z",
    );
  });

  it("accepts authoritative RFC3339 sub-millisecond precision", async () => {
    const quote = await createProvider().getQuote(
      listingId,
      "2026-08-08T06:00:00.123456Z",
    );

    expect(quote.as_of).toBe("2026-08-08T06:00:00.123Z");
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

    for (const invalidSnapshot of [
      "2026-08-08",
      "08/10/2026 00:00:00 +00:00",
      "August 10, 2026 00:00:00 +00:00",
      "2026-02-30T00:00:00.000Z",
      "2026-08-10T00:00:00+24:00",
    ]) {
      await expect(
        provider.getQuote(listingId, invalidSnapshot),
      ).rejects.toThrow("instant");
    }
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "",
          cursorEncryptionKey,
          clock: () => snapshot,
        }),
    ).toThrow("seed");
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "   ",
          cursorEncryptionKey,
          clock: () => snapshot,
        }),
    ).toThrow("seed");
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "seed",
          cursorEncryptionKey,
          clock: () => snapshot,
          pageSize: 0,
        }),
    ).toThrow("pageSize");

    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "seed",
          clock: () => snapshot,
        } as never),
    ).toThrow("cursorEncryptionKey");
    expect(
      () =>
        new SyntheticMarketDataProvider({
          seed: "seed",
          cursorEncryptionKey: new Uint8Array(16),
          clock: () => snapshot,
        }),
    ).toThrow("cursorEncryptionKey");

    for (const exchangeTimezone of [
      "Mars/Olympus",
      `A/${"A".repeat(100)}`,
      { zone: "Asia/Shanghai" },
    ]) {
      expect(
        () =>
          new SyntheticMarketDataProvider({
            seed: "seed",
            cursorEncryptionKey,
            clock: () => snapshot,
            exchangeTimezone: exchangeTimezone as never,
          }),
      ).toThrow("exchangeTimezone");
    }

    for (const cursorKeyId of [1, { toString: () => "m1" }]) {
      expect(
        () =>
          new SyntheticMarketDataProvider({
            seed: "seed",
            cursorEncryptionKey,
            cursorKeyId: cursorKeyId as never,
            clock: () => snapshot,
          }),
      ).toThrow("cursorKeyId");
    }
  });
});
