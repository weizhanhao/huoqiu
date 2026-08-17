import { describe, expect, it } from "vitest";

import { dayReturn } from "../../src/market/portfolio-return";

/*
 * 组合当日收益。
 *
 * 这个数字会被人拿去比谁做得好，所以它宁可是「—」，也不能是一个编出来的精确
 * 值。守的正是这一点。
 */

const quotes = (
  entries: readonly (readonly [string, number | null])[],
): ReadonlyMap<string, number | null> => new Map(entries);

describe("day return", () => {
  it("weights each holding by its share of the portfolio", () => {
    expect(
      dayReturn(
        [
          { symbol: "sh600519", weight: 50 },
          { symbol: "sz000001", weight: 50 },
        ],
        quotes([
          ["sh600519", 2],
          ["sz000001", -1],
        ]),
      ),
    ).toBeCloseTo(0.5, 10);
  });

  it("refuses to answer when one holding has no quote", () => {
    /*
     * 跳过取不到的那只，等于假设它今天没涨没跌——而它可能停牌、可能刚退市。
     * 算出来的数字看着精确，其实是编的，而且会被拿去排名次。
     */
    expect(
      dayReturn(
        [
          { symbol: "sh600519", weight: 50 },
          { symbol: "sz000001", weight: 50 },
        ],
        quotes([["sh600519", 2]]),
      ),
    ).toBeNull();
  });

  it("treats an explicitly unknown quote the same as a missing one", () => {
    expect(
      dayReturn(
        [{ symbol: "sh600519", weight: 100 }],
        quotes([["sh600519", null]]),
      ),
    ).toBeNull();
  });

  it("gives an empty portfolio a flat zero, not null", () => {
    /* 空组合的收益确实是 0，那不是「算不出来」。 */
    expect(dayReturn([], quotes([]))).toBe(0);
  });
});
