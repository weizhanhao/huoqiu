import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuoteMetricsGrid } from "../../../src/components/instrument/quote-metrics-grid";
import type { QuoteMetrics } from "../../../src/server/quote-metrics.server";

/*
 * 行情页那一片指标。
 *
 * 个股页此前只有六个数字，对着雪球那一片三十多格显得很空。
 *
 * 这里守两件事：数字的量纲要对（成交量按股、市值按亿），以及算不出来的
 * 那几格要如实空着。把没有的指标显示成 0，比空着糟得多——「市盈率 0.00」
 * 读起来是「便宜到极点」，不是「这种标的没有这个指标」。
 */

const metrics = (overrides: Partial<QuoteMetrics> = {}): QuoteMetrics => ({
  amount: 14_098_000_000,
  amplitudePercent: 2.23,
  bookValuePerShare: 2.0834,
  changeAmount: 2.08,
  changePercent: 3.93,
  earningsPerShare: 0.4216,
  floatMarketCap: 247_487_000_000,
  floatShares: 4_503_000_000,
  high: 55.38,
  last: 54.96,
  limitDown: 42.3,
  limitUp: 63.46,
  low: 54.2,
  name: "长鑫科技",
  open: 54.49,
  orderRatioPercent: -89.27,
  peDynamic: 37.11,
  peStatic: 1960.56,
  peTtm: 130.37,
  previousClose: 52.88,
  priceToBook: 26.38,
  symbol: "sh688825",
  totalMarketCap: 3_675_000_000_000,
  totalShares: 66_881_000_000,
  tradedAtSeconds: 1_786_678_199,
  turnoverPercent: 5.71,
  volumeRatio: 1.13,
  volumeShares: 257_248_300,
  week52High: 60.6,
  week52Low: 38.11,
  ...overrides,
});

describe("the metrics panel", () => {
  it("shows the numbers the way a quote page shows them", () => {
    const html = renderToStaticMarkup(<QuoteMetricsGrid metrics={metrics()} />);

    for (const label of [
      "最高",
      "今开",
      "涨停",
      "成交量",
      "最低",
      "昨收",
      "跌停",
      "成交额",
      "换手",
      "量比",
      "总市值",
      "振幅",
      "委比",
      "流通值",
      "市盈率(动)",
      "市盈率(TTM)",
      "每股收益",
      "市盈率(静)",
      "市净率",
      "每股净资产",
      "52周最高",
      "总股本",
      "52周最低",
      "流通股",
      "货币单位",
    ]) {
      expect(html, label).toContain(label);
    }

    expect(html).toContain("55.38");
    expect(html).toContain("63.46");
    expect(html).toContain("-89.27%");
    expect(html).toContain("1960.56");
    // 成交量按股，不是手：2.57 亿股。
    expect(html).toContain("2.57亿");
    // 市值三万多亿要写成万亿，不是一长串零。
    expect(html).toContain("3.68万亿");
    // 每股数保留两位，和同屏的市盈率、市净率对得上。
    expect(html).toContain("0.42");
    expect(html).toContain("2.08");
  });

  it("says CNY, HKD or USD by where the stock is listed", () => {
    // 货币不是猜的，是代码前缀决定的。
    expect(
      renderToStaticMarkup(<QuoteMetricsGrid metrics={metrics()} />),
    ).toContain("CNY");
    expect(
      renderToStaticMarkup(
        <QuoteMetricsGrid metrics={metrics({ symbol: "hk00700" })} />,
      ),
    ).toContain("HKD");
    expect(
      renderToStaticMarkup(
        <QuoteMetricsGrid metrics={metrics({ symbol: "usaapl" })} />,
      ),
    ).toContain("USD");
  });

  it("leaves an unavailable metric blank rather than zero", () => {
    /*
     * 指数没有市盈率、市净率。显示成「0.00」读起来像便宜到极点，
     * 而不是「这种标的没有这个指标」。
     */
    const html = renderToStaticMarkup(
      <QuoteMetricsGrid
        metrics={metrics({
          bookValuePerShare: null,
          earningsPerShare: null,
          peDynamic: null,
          peStatic: null,
          peTtm: null,
          priceToBook: null,
        })}
      />,
    );

    expect(html).not.toContain("0.00");
    expect(html).toContain("—");
  });
});
