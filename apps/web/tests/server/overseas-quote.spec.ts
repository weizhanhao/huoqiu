import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadOverseasSnapshot,
  parseOverseasSymbol,
  toInstrumentQuote,
} from "../../src/server/overseas-quote.server";

/*
 * 港股与美股的行情。
 *
 * 站内此前只有沪深：热股榜的港股、美股两个页签点不动，每一行都是死文本。
 * 而数据是有的——我把能用的免费源逐个打过。
 *
 * 报价走东财、日 K 走腾讯，不是随手混搭：东财的 push2his 日 K 在服务端
 * 密集调用下会成片断连（背靠背 20 次只成 1 次，同一秒 curl 却通），
 * 腾讯那条 20/20 全过。报价则相反，东财 15/15 稳且与热股榜同源，
 * 涨跌幅口径一致。
 *
 * 五件事错了不会报错，只会给出一张看起来正常的错表：
 *   1. 美股代码要带交易所后缀。不带的话腾讯照样回 code:0，只是把字段从
 *      qfqday 换成 day，内容是 2011 年的陈年数据——画出来的图完全正常，
 *      只是差了十五年；
 *   2. 后缀要试。.OQ 纳斯达克、.N 纽交所，光看代码分不出来；
 *   3. 港股代码是五位，要补零。腾讯是 00700 不是 700；
 *   4. 日 K 每行是 日期,开,收,高,低,成交量——收在第三位、高在第四位，
 *      按「开高低收」读会把收盘价当成最高价；
 *   5. 代码不存在时回的是空的 day 数组，不是错误码。
 *
 * 值是照真实结构改写的合成数据。
 */

const quoteBody = (overrides: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    data: {
      f43: 443.2,
      f44: 445,
      f45: 440,
      f46: 441.5,
      f47: 8_038_659,
      f48: 3_538_781_728,
      f57: "00700",
      f58: "腾讯控股",
      f60: 441,
      f169: 2.2,
      f170: 0.5,
      ...overrides,
    },
    rc: 0,
  });

/** 腾讯回的是 JSONP：`k={...}`，没有结尾分号。 */
const klineBody = (
  key: string,
  rows: Readonly<Record<string, unknown>>,
): string => `k=${JSON.stringify({ code: 0, data: { [key]: rows }, msg: "" })}`;

/** 港股行 9 列，第 7 个是个空对象；美股行 6 列。前 6 列一致。 */
const HK_ROW = [
  "2026-08-13",
  "446.400",
  "441.000",
  "452.200",
  "439.600",
  "66424623.000",
  {},
  "0.730",
  "2954559.791",
];

const requested: string[] = [];

const stubUpstream = (handler: (url: string) => string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    const body = handler(url);
    if (body === null) return new Response("", { status: 200 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested.length = 0;
});

describe("reading the symbol", () => {
  it("understands Hong Kong and US codes", () => {
    expect(parseOverseasSymbol("hk00700")).toEqual({
      code: "00700",
      market: "hk",
    });
    // 五位补零：腾讯是 00700，写 700 也该认得。
    expect(parseOverseasSymbol("hk700")).toEqual({
      code: "00700",
      market: "hk",
    });
    expect(parseOverseasSymbol("usaapl")).toEqual({
      code: "AAPL",
      market: "us",
    });
    // 美股代码带点或横杠的（BRK.B / BRK-B）东财写成下划线。
    expect(parseOverseasSymbol("usbrk_b")).toEqual({
      code: "BRK_B",
      market: "us",
    });
  });

  it("refuses anything that is not one of those", () => {
    for (const value of ["sh600519", "sz300404", "hk", "us", "", "hkabcde"]) {
      expect(parseOverseasSymbol(value), value).toBeNull();
    }
  });
});

describe("loading a Hong Kong quote", () => {
  it("asks eastmoney for the 116 market and reads the quote", async () => {
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", { qfqday: [] })
        : quoteBody(),
    );

    const snapshot = await loadOverseasSnapshot("hk00700");

    expect(requested[0]).toContain("secid=116.00700");
    expect(snapshot?.name).toBe("腾讯控股");
    expect(snapshot?.quote).toMatchObject({
      changePercent: 0.5,
      last: 443.2,
      previousClose: 441,
    });
  });
});

describe("loading a US quote", () => {
  it("tries each US exchange until one answers", async () => {
    /*
     * 105 纳斯达克、106 纽交所、107 美交所。给一个代码看不出它在哪个所，
     * 写死一个就等于另外两个所的票全都打不开。
     */
    stubUpstream((url) => {
      if (url.includes("gtimg")) return klineBody("usBRK_B.N", { qfqday: [] });
      if (url.includes("secid=106.")) {
        return quoteBody({ f57: "BRK_B", f58: "伯克希尔哈撒韦-B" });
      }
      // 105 与 107 都答不上来：上游对不存在的组合回 data:null。
      return JSON.stringify({ data: null, rc: 0 });
    });

    const snapshot = await loadOverseasSnapshot("usbrk_b");

    expect(snapshot?.name).toBe("伯克希尔哈撒韦-B");
    expect(requested.some((url) => url.includes("secid=105.BRK_B"))).toBe(true);
    expect(requested.some((url) => url.includes("secid=106.BRK_B"))).toBe(true);
  });

  it("carries the exchange over to the bar request as a suffix", async () => {
    /*
     * 这是最阴的一条。不带后缀，腾讯照样回 code:0——只是把字段从 qfqday
     * 换成 day，内容是 2011 年的。图画得出来、形状也正常，就是差了十五年。
     *
     * 报价已经问出它在哪个所了（106 = 纽交所），后缀直接跟着来，不必再猜。
     */
    stubUpstream((url) => {
      if (!url.includes("gtimg")) {
        return url.includes("secid=106.")
          ? quoteBody({ f57: "JPM", f58: "摩根大通" })
          : JSON.stringify({ data: null, rc: 0 });
      }
      if (url.includes("usJPM.N")) {
        return klineBody("usJPM.N", {
          qfqday: [
            [
              "2026-08-13",
              "360.05",
              "362.04",
              "363.12",
              "358.60",
              "4576473.00",
            ],
          ],
        });
      }
      // 不带后缀时上游给的是十五年前的 day 序列。
      return klineBody("usJPM", {
        day: [["2011-06-02", "41.51", "41.51", "42.10", "41.20", "1.00"]],
      });
    });

    const snapshot = await loadOverseasSnapshot("usjpm");

    expect(requested.some((url) => url.includes("usJPM.N"))).toBe(true);
    expect(snapshot?.bars).toHaveLength(1);
    expect(snapshot?.bars[0]?.date).toBe("2026-08-13");
  });

  it("spells a dotted ticker the way each upstream spells it", async () => {
    /*
     * 同一只股票，两边写法不一样：伯克希尔 B 股在东财是 BRK_B，在腾讯是
     * BRK.B。拿东财那份去问腾讯，回的是 code:0 加一个空的 day——不报错，
     * 只是这只股票永远没有图。
     */
    stubUpstream((url) => {
      if (!url.includes("gtimg")) {
        return url.includes("secid=106.")
          ? quoteBody({ f57: "BRK_B", f58: "伯克希尔哈撒韦-B" })
          : JSON.stringify({ data: null, rc: 0 });
      }
      if (url.includes("usBRK.B.N")) {
        return klineBody("usBRK.B.N", {
          qfqday: [
            [
              "2026-08-13",
              "528.76",
              "516.38",
              "530.30",
              "515.65",
              "4718562.00",
            ],
          ],
        });
      }
      return klineBody("usBRK_B.N", { day: [] });
    });

    const snapshot = await loadOverseasSnapshot("usbrk_b");

    expect(snapshot?.bars).toHaveLength(1);
    expect(snapshot?.bars[0]?.close).toBe(516.38);
  });

  it("keeps the quote when the exchange has no bars available", async () => {
    /*
     * 美交所（107）的票腾讯不给日 K。报价是有的，就照实给报价、日线留空，
     * 让页面自己说「暂无日线」——不能因为没有图就把整只股票判成不存在。
     */
    stubUpstream((url) => {
      if (url.includes("gtimg")) return klineBody("usIMO", { day: [] });
      return url.includes("secid=107.")
        ? quoteBody({ f57: "IMO", f58: "帝国石油" })
        : JSON.stringify({ data: null, rc: 0 });
    });

    const snapshot = await loadOverseasSnapshot("usimo");

    expect(snapshot?.name).toBe("帝国石油");
    expect(snapshot?.bars).toEqual([]);
    /*
     * 而且这一次上游根本不该打。已知美交所没有日 K 还去问，最好的结果是
     * 白费一次请求，最坏的是拼出 usIMO.OQ 这种后缀、拿回同名代码在别的
     * 交易所的图——那张图会正常画出来，只是画的不是这只股票。
     */
    expect(requested.some((url) => url.includes("gtimg"))).toBe(false);
  });
});

describe("reading the daily bars", () => {
  it("keeps 开高低收 in the order the feed actually uses", async () => {
    /*
     * 每行是 日期,开,收,高,低,成交量 —— 收在第三位、高在第四位。
     * 按「开高低收」去读，收盘价会被当成最高价，画出来的 K 线整片是错的，
     * 而形状看着仍然像模像样。
     */
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", { qfqday: [HK_ROW] })
        : quoteBody(),
    );

    const snapshot = await loadOverseasSnapshot("hk00700");

    expect(snapshot?.bars[0]).toEqual({
      close: 441,
      date: "2026-08-13",
      high: 452.2,
      low: 439.6,
      open: 446.4,
      volume: 66_424_623,
    });
  });

  it("drops a malformed row rather than guessing", async () => {
    /*
     * 两种坏法都要挡：列数不够的，和列数够、数值却读不出来的。
     * 后者尤其阴——Number("-") 是 NaN，一路带进 SVG 就是一根不画出来的
     * K 线，图上只是少了一天，不会报错。
     */
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", {
            qfqday: [
              HK_ROW,
              ["2026-08-12"],
              ["2026-08-14", "-", "-", "-", "-", "-"],
            ],
          })
        : quoteBody(),
    );

    const bars = (await loadOverseasSnapshot("hk00700"))?.bars;
    expect(bars).toHaveLength(1);
    expect(bars?.[0]?.date).toBe("2026-08-13");
  });

  it("refuses a stale day series even when the feed says code:0", async () => {
    /*
     * 代码不存在时腾讯不报错，回的是空的 day 数组；带 day 而不带 qfqday
     * 的响应一律不认——它要么是陈年数据，要么是空的。
     */
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", {
            day: [["2011-06-02", "1", "1", "1", "1", "1"]],
          })
        : quoteBody(),
    );

    expect((await loadOverseasSnapshot("hk00700"))?.bars).toEqual([]);
  });
});

describe("handing the quote to the detail page", () => {
  /* 报价头要的是 InstrumentQuote，那是照沪深的形状定的。 */
  const snapshotWith = async (
    overrides: Readonly<Record<string, unknown>>,
  ): ReturnType<typeof loadOverseasSnapshot> => {
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", { qfqday: [] })
        : quoteBody(overrides),
    );
    return loadOverseasSnapshot("hk00700");
  };

  it("leaves the order book empty instead of inventing one", async () => {
    /*
     * 免费接口给不出港美股的五档。空数组会让报价头整块略去盘口——
     * 这是对的。真正要防的是拿别的字段拼一张看着像五档的表。
     */
    const snapshot = await snapshotWith({ f86: 1_786_674_407 });
    const quote = toInstrumentQuote(snapshot);

    expect(quote?.asks).toEqual([]);
    expect(quote?.bids).toEqual([]);
    expect(quote?.last).toBe(443.2);
    /*
     * f86 是 epoch 秒。报价头拿到手只做 replace("T"," ") 就直接显示，
     * 所以这里必须交出北京时间的墙上时刻，和沪深那条路一个形状
     * （`${date}T${time}`，不带时区后缀）。
     *
     * 直接 toISOString() 会显示成 UTC——2026-08-14 10:26 的行情写成
     * 「02:26」，看盘的人对着一个差八小时的时间，不会怀疑是时区，
     * 只会以为这数据是几小时前的。
     */
    expect(quote?.tradedAt).toBe("2026-08-14T10:26:47");
  });

  it("refuses to build a half-filled quote", async () => {
    /*
     * 少一个关键数值就整个不给，让页面不渲染报价头。
     * 把缺失的价格显示成 0，看着就是一只跌到零的股票。
     */
    for (const missing of ["f43", "f60", "f46"]) {
      const snapshot = await snapshotWith({ [missing]: "-" });
      expect(toInstrumentQuote(snapshot), missing).toBeNull();
    }
  });

  it("gives nothing when there is no snapshot at all", () => {
    expect(toInstrumentQuote(null)).toBeNull();
  });
});

describe("when upstream has nothing", () => {
  it("returns nothing rather than an empty shell", async () => {
    stubUpstream((url) =>
      url.includes("gtimg")
        ? klineBody("hk00700", { qfqday: [] })
        : JSON.stringify({ data: null, rc: 0 }),
    );
    expect(await loadOverseasSnapshot("hk00700")).toBeNull();

    // 空 body 是上游限流时的表现，不是「这只股票不存在」。
    stubUpstream(() => null);
    expect(await loadOverseasSnapshot("hk00700")).toBeNull();
  });
});
