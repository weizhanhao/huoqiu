import { afterEach, describe, expect, it, vi } from "vitest";

import { loadQuoteMetrics } from "../../src/server/quote-metrics.server";

/*
 * 行情页那一片指标。
 *
 * 个股页此前只有六个数字（今开/昨收/最高/最低/成交量/成交额），雪球那一片
 * 是三十多个。数据一直都有——同一个报价接口返回 62 个非空字段。
 *
 * 字段号是照真实值一个一个对出来的，不是猜的。对照的是长鑫科技 688825
 * 在 2026-08-14 11:29 的实际页面：最高 55.38、涨停 63.46、换手 5.71%、
 * 委比 -89.27%、市盈率(静) 1960.56、总股本 668.81 亿……21 个字段精确命中。
 * 错一个不会报错，只会在页面上多一个看着正常的错数。
 *
 * 两个数是推出来的，不是直接取的：
 *   每股收益   = 现价 ÷ 市盈率(TTM)
 *   每股净资产 = 现价 ÷ 市净率
 * 接口里的 f55/f92 是最新报告期口径（长鑫 0.37 / 1.36），和雪球显示的
 * TTM 口径（0.42 / 2.08）不是一回事。按定义推出来的两个数与页面一致，
 * 而且与同屏的市盈率、市净率必然自洽。
 *
 * 值是照真实结构改写的合成数据。
 */

const body = (overrides: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    data: {
      f43: 54.96,
      f44: 55.38,
      f45: 54.2,
      f46: 54.49,
      f47: 2_572_483,
      f48: 14_098_000_000,
      f50: 1.13,
      f51: 63.46,
      f52: 42.3,
      f58: "长鑫科技",
      f60: 52.88,
      f84: 66_881_000_000,
      f85: 4_503_000_000,
      f86: 1_786_678_199,
      f116: 3_675_000_000_000,
      f117: 247_487_000_000,
      f162: 37.11,
      f163: 1960.56,
      f164: 130.37,
      f167: 26.38,
      f168: 5.71,
      f169: 2.08,
      f170: 3.93,
      f171: 2.23,
      f174: 60.6,
      f175: 38.11,
      f191: -89.27,
      ...overrides,
    },
    rc: 0,
  });

const stub = (handler: (url: string) => string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const payload = handler(String(input));
    if (payload === null) return new Response("", { status: 200 });
    return new Response(payload, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading every metric off the quote", () => {
  it("puts each number under the label it actually belongs to", async () => {
    stub(() => body());

    const metrics = await loadQuoteMetrics("sh688825");

    expect(metrics).toMatchObject({
      amplitudePercent: 2.23,
      high: 55.38,
      limitDown: 42.3,
      limitUp: 63.46,
      low: 54.2,
      open: 54.49,
      orderRatioPercent: -89.27,
      previousClose: 52.88,
      priceToBook: 26.38,
      turnoverPercent: 5.71,
      volumeRatio: 1.13,
      week52High: 60.6,
      week52Low: 38.11,
    });
  });

  it("derives per-share figures the way the ratios define them", async () => {
    /*
     * 接口里的 f55/f92 是最新报告期口径，和市盈率(TTM)、市净率不是同一套
     * 基准。直接摆上去，页面上会出现「现价 ÷ 每股收益 ≠ 市盈率」这种
     * 自己打自己脸的组合，而每个数字单看都像是对的。
     */
    stub(() => body({ f55: 0.370240781, f92: 1.3577108 }));

    const metrics = await loadQuoteMetrics("sh688825");

    // 54.96 ÷ 130.37 = 0.4216…
    expect(metrics?.earningsPerShare).toBeCloseTo(0.42, 2);
    // 54.96 ÷ 26.38 = 2.0834…
    expect(metrics?.bookValuePerShare).toBeCloseTo(2.08, 2);
  });

  it("counts A-share volume in shares, not lots", async () => {
    /*
     * f47 给的是手。长鑫那天是 2,572,483 手，页面上写的是 2.57 亿——
     * 那是股。照手直接显示会差一百倍，而「2.57 万手」这个数看起来
     * 一点问题都没有。
     *
     * 对得上：流通股 45.03 亿 × 换手 5.71% = 2.57 亿股。
     */
    stub(() => body());

    expect((await loadQuoteMetrics("sh688825"))?.volumeShares).toBe(
      257_248_300,
    );
  });

  it("does not convert lots where the feed already counts shares", async () => {
    /*
     * 沪深的 f47 是手，港美股的 f47 是股。一律乘 100，腾讯与苹果的成交量
     * 就整整大了一百倍——而「16.87 亿股」这个数摆在那里毫无破绽。
     *
     * 是实机对账逼出来的，不是看出来的：成交量应当约等于流通股 × 换手率，
     * 港美股那两行差了正好两个数量级。
     */
    stub(() => body({ f47: 168_700_000, f58: "腾讯控股" }));

    expect((await loadQuoteMetrics("hk00700"))?.volumeShares).toBe(168_700_000);
  });

  it("treats a zero ratio as no ratio at all", async () => {
    /*
     * 指数没有市盈率、市净率，上游给的是 0（不是 "-"）。照数字显示就是
     * 「市盈率 0.00」——读起来像便宜到极点，而不是「这种标的没有这个指标」。
     * 每股收益更糟：0 当除数会得到 Infinity。
     */
    stub(() => body({ f163: 0, f164: 0, f167: 0, f58: "上证指数" }));

    const metrics = await loadQuoteMetrics("sh000001");

    expect(metrics?.peTtm).toBeNull();
    expect(metrics?.peStatic).toBeNull();
    expect(metrics?.priceToBook).toBeNull();
    expect(metrics?.earningsPerShare).toBeNull();
    expect(metrics?.bookValuePerShare).toBeNull();
  });

  it("leaves a missing number missing", async () => {
    /*
     * 亏损公司没有市盈率，上游给的是 "-"。当成 0 的话，页面上会出现
     * 「市盈率 0.00」——那读起来像「便宜到极点」，而不是「算不出来」。
     */
    stub(() => body({ f162: "-", f164: "-", f174: "-" }));

    const metrics = await loadQuoteMetrics("sh688825");

    expect(metrics?.peDynamic).toBeNull();
    expect(metrics?.week52High).toBeNull();
    // 市盈率(TTM) 缺了，每股收益就推不出来——不能拿别的口径顶上。
    expect(metrics?.earningsPerShare).toBeNull();
  });

  it("does not let an empty string become zero", async () => {
    /*
     * "-" 那种缺失自己会露馅：Number("-") 是 NaN，随手一个有限性检查就
     * 拦下了。空字符串不会——Number("") 正好是 0，一路顺畅地变成页面上的
     * 「市盈率 0.00」「换手 0.00%」。看着像一只无人问津的股票，
     * 而不是一个没问到的数。
     */
    stub(() => body({ f163: "", f168: "", f191: "" }));

    const metrics = await loadQuoteMetrics("sh688825");

    expect(metrics?.peStatic).toBeNull();
    expect(metrics?.turnoverPercent).toBeNull();
    expect(metrics?.orderRatioPercent).toBeNull();
  });

  it("returns nothing at all when upstream has nothing", async () => {
    stub(() => JSON.stringify({ data: null, rc: 0 }));
    expect(await loadQuoteMetrics("sh688825")).toBeNull();

    // 空 body 是限流，不是「这只股票不存在」。
    stub(() => null);
    expect(await loadQuoteMetrics("sh688825")).toBeNull();
  });

  it("asks the right market for each kind of code", async () => {
    const asked: string[] = [];
    stub((url) => {
      asked.push(url);
      return body();
    });

    await loadQuoteMetrics("sh600519");
    await loadQuoteMetrics("sz300684");
    await loadQuoteMetrics("hk00700");

    expect(asked[0]).toContain("secid=1.600519");
    expect(asked[1]).toContain("secid=0.300684");
    expect(asked[2]).toContain("secid=116.00700");
  });
});
