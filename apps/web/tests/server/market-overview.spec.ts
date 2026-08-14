import { afterEach, describe, expect, it, vi } from "vitest";

import {
  leaderHrefOf,
  loadMarketOverview,
} from "../../src/server/market-overview.server";

/*
 * 行情中心的概览数据。
 *
 * 这一页此前整页都是样本——「恒生样本指数」「全球航运」「星港制造」，
 * 点数、涨跌幅、概念热度全是写死的常量。站内最该是真数据的一页，
 * 反倒一个真数字都没有。
 *
 * 这一份守四件事，每一件错了都不会有报错，只会给出一张看起来正常的错表：
 *   1. 指数按本地清单的顺序回填，不用上游返回的顺序——否则那一排每次
 *      刷新都换位置；
 *   2. 涨跌家数是沪深两个指数相加，三个数（涨/跌/平）一个都不能省；
 *   3. 板块的领涨股要按号段补市场前缀，补错会指向另一只完全不同的股票；
 *   4. 板块的 diff 可能是对象而不是数组，只认数组会让整块永远是空的。
 *
 * 值是照真实结构改写的合成数据。
 */

const INDEX_ROWS = [
  { f12: "000001", f14: "上证指数", f2: 3926.96, f3: -0.5 },
  { f12: "399001", f14: "深证成指", f2: 14_289.44, f3: -0.87 },
  { f12: "399006", f14: "创业板指", f2: 3586.04, f3: -0.45 },
];

const BREADTH_ROWS = [
  { f104: 529, f105: 1777, f106: 45, f12: "000001", f14: "上证指数" },
  { f104: 571, f105: 2314, f106: 47, f12: "399001", f14: "深证成指" },
];

const SECTOR_ROWS = {
  "0": {
    f104: 5,
    f105: 0,
    f12: "BK1602",
    f128: "示例医学",
    f14: "诊断服务",
    f140: "301060",
    f3: 5.66,
  },
  "1": {
    f104: 24,
    f105: 5,
    f12: "BK1600",
    f128: "示例药业",
    f14: "医疗研发外包",
    f140: "600519",
    f3: 5.39,
  },
};

const bodyOf = (diff: unknown): string => JSON.stringify({ data: { diff } });

const stubUpstream = (): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("f106")) return new Response(bodyOf(BREADTH_ROWS));
    if (url.includes("m%3A90")) return new Response(bodyOf(SECTOR_ROWS));
    return new Response(bodyOf(INDEX_ROWS));
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a sector's leading stock links to the right listing", () => {
  it("adds the market prefix its code belongs to", () => {
    /*
     * 上游只给六位代码。补错前缀会把人送到另一只完全不同的股票上，
     * 而地址栏看起来一切正常。
     */
    expect(leaderHrefOf("600519")).toBe("/instruments/sh600519");
    expect(leaderHrefOf("688265")).toBe("/instruments/sh688265");
    expect(leaderHrefOf("301060")).toBe("/instruments/sz301060");
    expect(leaderHrefOf("000858")).toBe("/instruments/sz000858");
  });

  it("gives no link at all when it cannot tell", () => {
    // 北交所的 92xxxx 站内渲染不出来：先许诺点得进去、再给一张空页，更糟。
    for (const code of ["920367", "abcdef", "", null, undefined, 600_519]) {
      expect(leaderHrefOf(code), String(code)).toBeNull();
    }
  });
});

describe("the market overview", () => {
  it("keeps the indexes in the order this site lists them", async () => {
    stubUpstream();

    const overview = await loadMarketOverview();

    /*
     * 用上游返回的顺序，「主要指数」那一排每次刷新都会换位置——
     * 用户记住的「第二个是深证成指」下一秒就不成立了。
     */
    expect(overview?.indexes.map((index) => index.name)).toEqual([
      "上证指数",
      "深证成指",
      "创业板指",
    ]);
    expect(overview?.indexes[0]).toEqual({
      changePercent: -0.5,
      last: 3926.96,
      name: "上证指数",
      symbol: "sh000001",
    });
  });

  it("adds Shanghai and Shenzhen together, keeping the flat count", async () => {
    stubUpstream();

    const overview = await loadMarketOverview();

    /*
     * 529+571 涨、1777+2314 跌、45+47 平。平盘那一栏省不得——
     * 省了之后三个数凑不成全部，而页面上看不出少了哪一块。
     */
    expect(overview?.breadth).toEqual({
      advancing: 1100,
      declining: 4091,
      unchanged: 92,
    });
  });

  it("reads the object-shaped sector list", async () => {
    stubUpstream();

    const overview = await loadMarketOverview();

    // 板块的 diff 是以 "0"、"1" 为键的对象；只认数组会让整块永远是空的。
    expect(overview?.industries).toHaveLength(2);
    expect(overview?.industries[0]).toEqual({
      advancing: 5,
      changePercent: 5.66,
      code: "BK1602",
      declining: 0,
      leaderHref: "/instruments/sz301060",
      leaderName: "示例医学",
      name: "诊断服务",
    });
  });

  it("keeps the rest of the page when one block is missing", async () => {
    // 指数取不到，不该连带把板块也藏起来。
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("m%3A90")) return new Response(bodyOf(SECTOR_ROWS));
      return new Response("", { status: 500 });
    });

    const overview = await loadMarketOverview();

    expect(overview?.indexes).toHaveLength(0);
    expect(overview?.breadth).toBeNull();
    expect(overview?.industries).toHaveLength(2);
  });

  it("returns nothing when every block is empty", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));

    // 四份全空就是真的取不到，不该给出一张四块都是空的壳。
    expect(await loadMarketOverview()).toBeNull();
  });
});
