import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifySymbol,
  loadListQuotes,
  resetListQuoteCache,
} from "../../src/server/market-list.server";

/*
 * 自选列表的批量行情。
 *
 * 来源：东方财富批量行情接口（免费、无需鉴权、已实测可用）：
 *   https://push2.eastmoney.com/api/qt/ulist.np/get?secids=1.000001,0.300862,...
 *
 * 自选保存在浏览器本地，服务端不知道有哪些标的，所以是「给一串代码、取一串价」。
 *
 * 这一份守两个陷阱：
 *   1. 不加 fltt=2 时，上游给的是整数编码——腾讯的 441000 是 441.00 元，
 *      -446 是 -4.46%。直接显示就是把股价放大一千倍。
 *   2. secid 的市场前缀必须对：沪市是 1、深市是 0，弄反了会取到另一只股票，
 *      或者干脆取不到——而「取到另一只」在页面上完全看不出来。
 */

const ROWS = [
  { f12: "300862", f13: 0, f14: "示例科技", f2: 39.41, f3: 20.01, f4: 6.57 },
  { f12: "000001", f13: 1, f14: "上证指数", f2: 3926.96, f3: -0.5, f4: -19.72 },
];

/*
 * 每条用例前清掉微缓存。
 *
 * 取数层为了不反复打免费接口，对同一串代码有两秒的进程内缓存。
 * 不清的话，后一条用例会命中前一条留下的结果——「上游失败应返回 null」
 * 会拿到上一条的成功数据而误绿。
 */
beforeEach(() => {
  resetListQuoteCache();
});

const stub = (rows: readonly unknown[] | null): { seen: () => string } => {
  let seen = "";
  vi.stubGlobal("fetch", async (input: string | URL) => {
    seen = String(input);
    if (rows === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify({ data: { diff: rows } }), {
      status: 200,
    });
  });
  return { seen: () => seen };
};

describe("batch quotes for a watchlist", () => {
  it("asks the endpoint for already-scaled decimals", async () => {
    const probe = stub(ROWS);

    await loadListQuotes(["sz300862"]);

    /*
     * 少了 fltt=2，上游回的是整数编码：441000 表示 441.00。
     * 那样每只股票的价格都会被放大一千倍，而页面上看起来只是「贵了点」。
     */
    expect(probe.seen()).toContain("fltt=2");
  });

  it("puts the right market prefix on each code", async () => {
    const probe = stub(ROWS);

    await loadListQuotes(["sh600519", "sz300862", "sh000001"]);

    // 沪市是 1、深市是 0。弄反了会取到另一只股票或者取不到。
    expect(probe.seen()).toContain("1.600519");
    expect(probe.seen()).toContain("0.300862");
    expect(probe.seen()).toContain("1.000001");
  });

  it("takes the trade time from f124, not f86", async () => {
    /*
     * 同一个字段号在两个接口里含义不同：
     *   stock/get   f86 = 1786689133（epoch 秒）  f124 = 0
     *   ulist.np    f86 = 0.01（不是时间）        f124 = 1786689133
     * 这里走的是 ulist.np，所以时间在 f124。拿 f86 当秒数，页面上的成交
     * 时间会变成 1970-01-01——而价格照常跳动，只有那行时间在说胡话。
     *
     * 这个是实机才发现的：夹具里当初压根没有那个字段，测试一路是绿的。
     */
    stub([
      {
        f12: "600519",
        f13: 1,
        f14: "示例",
        f2: 1,
        f3: 1,
        f4: 1,
        f86: 0.01,
        f124: 1_786_689_133,
      },
    ]);

    const quotes = await loadListQuotes(["sh600519"]);

    expect(quotes?.[0]?.tradedAtSeconds).toBe(1_786_689_133);
  });

  it("prices Hong Kong and US holdings too", async () => {
    /*
     * 港美股此前在这里被整条丢掉：自选里加一只腾讯控股，那一行永远是「—」。
     * 个股页刚支持了这两个市场，页面上还带着「加自选」按钮——加得进去、
     * 却报不出价，是我自己开的口子。
     *
     * 美股的交易所看代码分不出来，而这个接口一次要问几十只，逐只去试代价
     * 太大。ulist 允许一次问多个 secid，认不出的那些不会回行——所以把
     * 105/106/107 三个都塞进去，让上游自己挑，一次请求解决。
     */
    const probe = stub(ROWS);

    // hk700 与 hk00700 是同一只：不补零会问出一个上游认不得的 secid。
    await loadListQuotes(["hk700", "usaapl"]);

    expect(probe.seen()).toContain("116.00700");
    expect(probe.seen()).toContain("105.AAPL");
    expect(probe.seen()).toContain("106.AAPL");
    expect(probe.seen()).toContain("107.AAPL");
  });

  it("maps a Hong Kong row back onto the symbol the caller asked with", async () => {
    /*
     * 回填按 f13 分市场。若按沪深那套 `market === 1 ? sh : sz` 去拼，
     * 00700 会变成 sz00700——一个不存在的代码，于是这一行照旧空着，
     * 而请求其实是成功的。
     *
     * 港股的 f13 在这里是 116，不是 128：ulist.np 与热股榜走的 clist 对
     * 同一个市场给的编号不一样（clist 的筛选串里写的是 m:128）。我第一版
     * 就是照 clist 那个值写的夹具，测试全绿，真接口上每一只港股照旧掉队。
     */
    stub([
      {
        f12: "00700",
        f13: 116,
        f14: "腾讯控股",
        f2: 443.2,
        f3: 0.5,
        f4: 2.2,
      },
    ]);

    const quotes = await loadListQuotes(["hk00700"]);

    expect(quotes?.[0]).toMatchObject({
      last: 443.2,
      name: "腾讯控股",
      symbol: "hk00700",
    });
  });

  it("answers a Hong Kong code that was written without the leading zeros", async () => {
    /*
     * 上游认得 hk700，回来的却是 00700——按原样去查表就对不上，于是这一行
     * 静静地少掉：请求成功、别的行都在，只有它没有价，看着像这只票停牌了。
     */
    stub([
      { f12: "00700", f13: 116, f14: "腾讯控股", f2: 443.2, f3: 0.5, f4: 2.2 },
    ]);

    const quotes = await loadListQuotes(["hk700"]);

    // 还回去的代码仍是调用方问的那个，否则前端拿它对不上自选里的行。
    expect(quotes?.[0]).toMatchObject({ last: 443.2, symbol: "hk700" });
  });

  it("maps a row back onto the symbol the caller asked with", async () => {
    stub(ROWS);

    const quotes = await loadListQuotes(["sz300862", "sh000001"]);

    /*
     * 整个形状一起断言，不是挑几个字段——多出来或少掉一个字段，
     * 这条就该红。tradedAtSeconds 是后加的：价格能自己刷新之后，
     * 前端要靠它说明「这个价是几点几分的」，否则价在跳而时间戳停着。
     * 这一行夹具没有时间字段，所以是 null。
     */
    expect(quotes?.[0]).toEqual({
      changeAmount: 6.57,
      changePercent: 20.01,
      last: 39.41,
      name: "示例科技",
      symbol: "sz300862",
      tradedAtSeconds: null,
    });
    expect(quotes?.[1]?.symbol).toBe("sh000001");
  });

  it("drops a symbol it cannot address instead of guessing a market", async () => {
    const probe = stub(ROWS);

    await loadListQuotes(["sz300862", "listing_syn_0001", "", "us:AAPL"]);

    /*
     * 猜一个市场前缀会取回另一只股票的价格，挂在这个名字下面——
     * 那比不显示危险得多。
     */
    expect(probe.seen()).toContain("0.300862");
    expect(probe.seen()).not.toContain("listing_syn_0001");
  });

  it("returns nothing when there is nothing addressable to ask about", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    expect(await loadListQuotes([])).toBeNull();
    expect(await loadListQuotes(["listing_syn_0001"])).toBeNull();
    expect(calls).toBe(0);
  });

  it("returns nothing when upstream fails", async () => {
    stub(null);

    expect(await loadListQuotes(["sz300862"])).toBeNull();
  });
});

describe("sorting a watched symbol into a category", () => {
  it("recognises the categories the app can actually hold", () => {
    expect(classifySymbol("sh600519")).toBe("stock");
    expect(classifySymbol("sz300862")).toBe("stock");
    expect(classifySymbol("sh688265")).toBe("stock");
    expect(classifySymbol("sh000001")).toBe("index");
    expect(classifySymbol("sz399006")).toBe("index");
    expect(classifySymbol("sh510300")).toBe("fund");
    expect(classifySymbol("sz159915")).toBe("fund");
  });

  it("falls back to the delayed source when the main one is throttled", async () => {
    /*
     * 主源对这个端点会限流，回的是**空响应体**——不是 500，也不是 JSON。
     *
     * 这是全站唯一一个没有延时源回退的取数模块，而指数条、自选行情和
     * 组合当日收益都靠它：主源一限流，这三处同时变成「—」，
     * /api/market/quotes 直接 502。一份晚十几分钟的真行情比一片空白有用。
     */
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("push2delay")) {
        return new Response(JSON.stringify({ data: { diff: ROWS } }), {
          status: 200,
        });
      }
      // 限流时上游回 200 但响应体为空，JSON.parse 会抛。
      return new Response("", { status: 200 });
    });

    const quotes = await loadListQuotes(["sz300862"]);

    expect(seen.some((url) => url.includes("push2delay"))).toBe(true);
    expect(quotes?.[0]?.last).toBe(39.41);
  });

  it("refuses to file something it does not recognise", () => {
    /*
     * 认不出来就归到「其他」，不硬塞进沪深——把一个虚构标的显示成 A 股，
     * 用户会以为它有真实行情。
     */
    for (const symbol of ["listing_syn_0001", "", "us:AAPL", "600519"]) {
      expect(classifySymbol(symbol), symbol).toBe("other");
    }
  });
});
