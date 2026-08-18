import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadChartSeries,
  resetChartSeriesCache,
} from "../../src/server/chart-series.server";

/*
 * 图表的各个周期。
 *
 * 雪球图上方有一排：分时 / 五日 / 日K / 周K / 月K / 年K / 120分…1分。
 * 站内此前只有一张日 K，切都切不了。
 *
 * 全部走腾讯。东财那两个源（push2 / push2his）在服务端会成片断连——
 * 同一分钟内 curl 通、Node 挂，日 K 早先就是为这个换掉的。
 *
 * 三个坑，错了都不报错：
 *   1. 分时行是「时间 价格 成交量 成交额」，成交量在沪深是手、在港股是股。
 *      一律当手乘 100，港股的量就大了一百倍；
 *   2. 均价不是各分钟价格的平均，是累计成交额 ÷ 累计成交股数。按前者算，
 *      那条线会平白偏离，而它看起来仍然像一条均价线；
 *   3. 各周期在上游的字段名不一样（qfqday / qfqweek / qfqmonth），
 *      拿错了会得到一个空数组——图是空的，但请求成功、页面不报错。
 *
 * 值是照真实结构改写的合成数据。
 */

const minuteBody = (key: string, rows: readonly string[]): string =>
  JSON.stringify({
    code: 0,
    data: { [key]: { data: { data: rows, date: "20260814" } } },
    msg: "",
  });

const klineBody = (
  key: string,
  field: string,
  rows: readonly unknown[],
): string =>
  `k=${JSON.stringify({ code: 0, data: { [key]: { [field]: rows } }, msg: "" })}`;

const requested: string[] = [];

const stub = (handler: (url: string) => string | null): void => {
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
  /*
   * 用例之间清缓存。
   *
   * 不清的话，第二条用例问同一只票会命中上一条留下的结果，于是「拿错字段名
   * 应该返回空」那类断言拿到的是上一条的成功结果——而它会绿。
   */
  resetChartSeriesCache();
});

describe("the intraday series", () => {
  it("treats the volume and amount columns as running totals", async () => {
    /*
     * 第三、四列是**累计**值，不是每分钟的。两只票实测都严格递增。
     *
     * 我最初按每分钟读，还「验证」通过了——用的是第二个数据点，而开盘
     * 初期的累计均价恰好约等于当前价，所以怎么算都对得上。等到下午，
     * 成交量图变成一条平滑爬坡（累计曲线），均价则差出一百倍。
     *
     * 每分钟的量是相邻两个累计值之差；第一分钟就是它自己。
     */
    stub(() =>
      minuteBody("sh600519", [
        "0930 1355.00 227 30758500.00",
        "0931 1353.27 1172 158617949.00",
      ]),
    );

    const series = await loadChartSeries("sh600519", "intraday");

    expect(series?.kind).toBe("line");
    if (series?.kind !== "line") throw new Error("分时应当是折线");
    expect(series.points[0]).toMatchObject({
      price: 1355,
      time: "09:30",
      volumeShares: 22_700,
    });
    // 第二分钟成交 (1172 − 227) 手 = 94,500 股，不是 117,200。
    expect(series.points[1]?.volumeShares).toBe(94_500);
    /*
     * 均价直接取累计额 ÷ 累计股数，不用自己再累加一遍：
     *   158,617,949 ÷ 117,200 = 1353.4
     */
    expect(series.points[1]?.averagePrice).toBeCloseTo(1353.4, 1);
  });

  it("works out the volume unit from the amount, not from the market", async () => {
    /*
     * 单位是**逐股不同**的，不是按市场分的：
     *   茅台 600519  末行 25,411        当日 0.02 亿股 → 手
     *   长鑫 688825  末行 318,840,911   当日 3.18 亿股 → 股
     * 两只都是沪市，一个给手一个给股。按前缀判断，其中一只必然差一百倍。
     *
     * 成交额 ÷ 成交量 会自己说明白：约等于价格就是股，约等于价格×100
     * 就是手。这样每只票各判各的，不必猜。
     */
    stub(() => minuteBody("sh688825", ["0930 54.49 6576615 358359751.00"]));

    const series = await loadChartSeries("sh688825", "intraday");

    if (series?.kind !== "line") throw new Error("分时应当是折线");
    // 358,359,751 ÷ 6,576,615 = 54.5 ≈ 价格 → 这一列是股，不该再乘 100。
    expect(series.points[0]?.volumeShares).toBe(6_576_615);
  });

  it("does not multiply Hong Kong volume by a hundred", async () => {
    /*
     * 腾讯 09:30 是 1,188,226 股，1188226 × 436 ≈ 518,067,478，
     * 与成交额对得上——这一列是股。当成手再乘 100，成交量整整大一百倍，
     * 而数字本身毫无破绽。
     */
    stub(() => minuteBody("hk00700", ["0930 436.000 1188226 518067478.000"]));

    const series = await loadChartSeries("hk00700", "intraday");

    if (series?.kind !== "line") throw new Error("分时应当是折线");
    expect(series.points[0]?.volumeShares).toBe(1_188_226);
  });

  it("keeps the previous close so the chart knows where zero is", async () => {
    /*
     * 分时图的百分比刻度和涨跌配色都以昨收为基准。没有昨收，那张图
     * 只能按当日最低点画基线——颜色和百分比会整片是错的。
     */
    stub((url) =>
      url.includes("minute")
        ? minuteBody("sh600519", ["0930 1355.00 227 30758500.00"])
        : klineBody("sh600519", "qfqday", [
            ["2026-08-13", "1350.00", "1342.55", "1360.00", "1340.00", "19725"],
            // 最后一根是今天，还没收盘。
            ["2026-08-14", "1355.00", "1348.91", "1359.00", "1341.21", "19725"],
          ]),
    );

    const series = await loadChartSeries("sh600519", "intraday");

    /*
     * 倒数第二根才是昨收。拿最后一根（今天）当昨收，涨跌幅会恒等于零，
     * 那条零轴也就画到了今天的收盘价上——整张图的颜色和百分比全是错的。
     */
    expect(series?.previousClose).toBe(1342.55);
  });
});

describe("the candle periods", () => {
  it("asks for the field name each period actually uses", async () => {
    /*
     * 日/周/月在上游是三个不同的字段名。拿错了得到的是一个空数组——
     * 图是空的，但请求成功、页面不报错。
     */
    for (const [period, field] of [
      ["day", "qfqday"],
      ["week", "qfqweek"],
      ["month", "qfqmonth"],
    ] as const) {
      stub(() =>
        klineBody("sh600519", field, [
          ["2026-08-14", "1355.00", "1342.21", "1359.00", "1341.21", "19725"],
        ]),
      );

      const series = await loadChartSeries("sh600519", period);

      expect(series?.kind, period).toBe("candle");
      if (series?.kind !== "candle") throw new Error("K 线应当是蜡烛");
      expect(series.bars, period).toHaveLength(1);
      requested.length = 0;
    }
  });

  it("keeps 开收高低 in the order the feed uses", async () => {
    // 日期,开,收,高,低,量 —— 收在第三位、高在第四位。
    stub(() =>
      klineBody("sh600519", "qfqday", [
        ["2026-08-14", "1355.00", "1342.21", "1359.00", "1341.21", "19725"],
      ]),
    );

    const series = await loadChartSeries("sh600519", "day");

    if (series?.kind !== "candle") throw new Error("K 线应当是蜡烛");
    expect(series.bars[0]).toMatchObject({
      close: 1342.21,
      high: 1359,
      low: 1341.21,
      open: 1355,
    });
  });

  it("uses the minute endpoint for the minute periods", async () => {
    stub(() => klineBody("sh600519", "m60", []));

    await loadChartSeries("sh600519", "m60");

    /*
     * 分钟 K 在 ifzq.gtimg.cn，日周月 K 在 web.ifzq.gtimg.cn。
     * 域名弄混了拿到的是 ENOTFOUND——图空着，而代码看起来完全正确。
     */
    expect(requested[0]).toContain("//ifzq.gtimg.cn/");
    expect(requested[0]).not.toContain("web.ifzq.gtimg.cn");
    expect(requested[0]).toContain("mkline");
    expect(requested[0]).toContain("m60");
  });
});

describe("the short-lived series cache", () => {
  /*
   * 个股页上方有八个周期按钮。每按一次就是一次外呼，而外呼是有闸的
   * （每个来源每分钟 60 次）——来回切几轮就把自己限住了，界面上写的是
   * 「请求过于频繁」，而用户做的事只是在看同一只票的不同周期。
   *
   * 同一只票同一个周期，几十秒内本来就是同一份数据。缓存一下，来回切就不再
   * 花任何外呼额度，切回刚看过的那个周期也立刻出图。
   */
  const rows = [["2026-08-17", "10.00", "11.00", "12.00", "9.00", "100"]];

  it("serves a repeat request without asking upstream again", async () => {
    stub(() => klineBody("sh600519", "qfqday", rows));

    const first = await loadChartSeries("sh600519", "day");
    const callsAfterFirst = requested.length;
    const second = await loadChartSeries("sh600519", "day");

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(requested.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
  });

  it("keeps each period separate", async () => {
    /* 共用一个键的话，切到周 K 会拿到日 K 的那份——图变了，数据没变。 */
    stub((url) =>
      klineBody("sh600519", url.includes(",week,") ? "qfqweek" : "qfqday", rows),
    );

    await loadChartSeries("sh600519", "day");
    const afterDay = requested.length;
    await loadChartSeries("sh600519", "week");

    expect(requested.length).toBeGreaterThan(afterDay);
  });
});

describe("the quarter candles", () => {
  /*
   * 上游没有季线这一档，雪球的周期条上却有。月 K 折成季 K 和折成年 K 是同一件
   * 事，只是分组的键从「年」换成「年+第几季」——同一份数据换个粒度，每一格都
   * 能回月 K 对上。
   */
  const months = [
    ["2025-01-31", "10.00", "12.00", "13.00", "9.00", "100"],
    ["2025-02-28", "12.00", "11.00", "15.00", "8.00", "200"],
    ["2025-03-31", "11.00", "14.00", "14.50", "10.50", "300"],
    ["2025-04-30", "14.00", "16.00", "17.00", "13.00", "400"],
  ];

  it("groups three months into one bar", async () => {
    stub(() => klineBody("sh600519", "qfqmonth", months));

    const series = await loadChartSeries("sh600519", "quarter");

    expect(series?.kind).toBe("candle");
    const bars = series?.kind === "candle" ? series.bars : [];
    expect(bars).toHaveLength(2);

    const [first] = bars;
    expect(first?.date).toBe("2025Q1");
    expect(first?.open).toBe(10);
    expect(first?.close).toBe(14);
    expect(first?.high).toBe(15);
    expect(first?.low).toBe(8);
    expect(first?.volumeShares).toBe(600 * 100);

    /* 四月单独成一季，不能被并进一季度。 */
    expect(bars[1]?.date).toBe("2025Q2");
  });
});

describe("the year candles", () => {
  /*
   * 上游的 year 字段只回一根。
   *
   * 一根蜡烛不是一张图——年 K 那一档点开，屏幕正中是一个孤零零的方块，
   * 而它请求成功、不报错。月 K 能回到 2001 年，年 K 由月 K 折出来：
   * 开＝当年第一个月的开，收＝最后一个月的收，高低取极值，量求和。
   * 这不是造数，是同一份数据换个粒度，每一格都能回月 K 对上。
   */
  const months = [
    ["2025-01-31", "10.00", "12.00", "13.00", "9.00", "100"],
    ["2025-06-30", "12.00", "11.00", "15.00", "8.00", "200"],
    ["2025-12-31", "11.00", "14.00", "14.50", "10.50", "300"],
    ["2026-03-31", "14.00", "16.00", "17.00", "13.00", "400"],
  ];

  it("folds the monthly series into one bar per year", async () => {
    stub(() => klineBody("sh600519", "qfqmonth", months));

    const series = await loadChartSeries("sh600519", "year");

    expect(series?.kind).toBe("candle");
    const bars = series?.kind === "candle" ? series.bars : [];
    expect(bars).toHaveLength(2);

    const [first] = bars;
    expect(first?.date).toBe("2025");
    /* 开＝一月的开，收＝十二月的收。 */
    expect(first?.open).toBe(10);
    expect(first?.close).toBe(14);
    /* 高低是全年的极值，不是任何单月的。 */
    expect(first?.high).toBe(15);
    expect(first?.low).toBe(8);
    /* 成交量是全年累计（上游给手，站内换成股）。 */
    expect(first?.volumeShares).toBe(600 * 100);
  });

  it("asks for the monthly field, not the year field", async () => {
    /* 直接问 year 拿回来的是一根。这条断言盯的就是「别再改回去」。 */
    stub(() => klineBody("sh600519", "qfqmonth", months));

    await loadChartSeries("sh600519", "year");

    expect(requested.join(" ")).toContain(",month,");
    expect(requested.join(" ")).not.toContain(",year,");
  });
});

describe("when upstream gives nothing", () => {
  it("returns nothing rather than an empty chart", async () => {
    stub(() => null);
    expect(await loadChartSeries("sh600519", "day")).toBeNull();

    stub(() => klineBody("sh600519", "qfqday", []));
    expect(await loadChartSeries("sh600519", "day")).toBeNull();
  });

  it("refuses a period it does not know", async () => {
    stub(() => klineBody("sh600519", "qfqday", []));
    // @ts-expect-error 故意传一个不存在的周期。
    expect(await loadChartSeries("sh600519", "century")).toBeNull();
    expect(requested).toHaveLength(0);
  });
});
