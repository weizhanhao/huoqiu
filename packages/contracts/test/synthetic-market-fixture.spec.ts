import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { d0FixtureSchema } from "../src/d0/schema.js";

const loadFixture = (): unknown =>
  JSON.parse(
    readFileSync(new URL("../fixtures/d0.v1.json", import.meta.url), "utf8"),
  );

describe("synthetic D0 market fixture", () => {
  it("keeps the searchable synthetic listing and quote identity stable", () => {
    const parsed = d0FixtureSchema.parse(loadFixture());

    expect(parsed.instruments).toEqual([
      {
        instrument_id: "instrument_syn_0001",
        listing_id: "listing_syn_0001",
        symbol: "SYN001",
        name: "合成示例一号",
        pinyin: "hechengshiliyhao",
        aliases: ["合成一号", "synthetic one"],
        market: "CN",
        currency: "CNY",
        status: "open",
      },
    ]);
    expect(parsed.quotes).toEqual([
      {
        listing_id: "listing_syn_0001",
        last: "108.64",
        change: "1.26",
        change_pct: "1.1734",
        source: "huoqiu-synthetic",
        as_of: "2026-08-08T06:00:00.000Z",
        stale: false,
        entitlement: "synthetic",
      },
    ]);
  });

  it("contains exactly 20 ordered and deterministic daily bars", () => {
    const parsed = d0FixtureSchema.parse(loadFixture());
    const series = parsed.bars[0];

    expect(series?.listing_id).toBe("listing_syn_0001");
    expect(series?.interval).toBe("1d");
    expect(series?.points).toHaveLength(20);
    expect(series?.points[0]).toEqual({
      at: "2026-07-20T05:00:00.000Z",
      open: "99.80",
      high: "101.40",
      low: "99.10",
      close: "100.60",
      volume: "1200000",
    });
    expect(series?.points[19]).toEqual({
      at: "2026-08-08T05:00:00.000Z",
      open: "107.20",
      high: "109.10",
      low: "106.88",
      close: "108.64",
      volume: "1980000",
    });
    expect(
      series?.points.every(
        (point, index, points) =>
          index === 0 || point.at > (points[index - 1]?.at ?? ""),
      ),
    ).toBe(true);
  });

  it("rejects duplicate and dangling listing references", () => {
    const fixture = d0FixtureSchema.parse(loadFixture());

    expect(() =>
      d0FixtureSchema.parse({
        ...fixture,
        instruments: [...fixture.instruments, fixture.instruments[0]],
      }),
    ).toThrow();
    expect(() =>
      d0FixtureSchema.parse({
        ...fixture,
        quotes: [{ ...fixture.quotes[0], listing_id: "listing_missing" }],
      }),
    ).toThrow();
  });

  it("compares bounded decimal candles without floating-point rounding", () => {
    const fixture = d0FixtureSchema.parse(loadFixture());
    const series = fixture.bars[0];
    const firstPoint = series?.points[0];

    expect(series).toBeDefined();
    expect(firstPoint).toBeDefined();
    expect(() =>
      d0FixtureSchema.parse({
        ...fixture,
        bars: [
          {
            ...series,
            points: [
              {
                ...firstPoint,
                open: "999999999999.99999998",
                high: "999999999999.99999997",
                low: "999999999999.00000000",
                close: "999999999999.50000000",
              },
              ...(series?.points.slice(1) ?? []),
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects quote or bar timestamps beyond the fixture snapshot", () => {
    const fixture = d0FixtureSchema.parse(loadFixture());
    const series = fixture.bars[0];
    const lastPoint = series?.points[19];

    expect(() =>
      d0FixtureSchema.parse({
        ...fixture,
        quotes: [
          {
            ...fixture.quotes[0],
            as_of: "2026-08-08T06:00:01.000Z",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      d0FixtureSchema.parse({
        ...fixture,
        bars: [
          {
            ...series,
            points: [
              ...(series?.points.slice(0, 19) ?? []),
              { ...lastPoint, at: "2026-08-08T06:00:01.000Z" },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
