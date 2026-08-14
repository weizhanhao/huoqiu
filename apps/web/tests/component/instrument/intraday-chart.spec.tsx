import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IntradayChart } from "../../../src/components/instrument/intraday-chart";
import type { LinePoint } from "../../../src/server/chart-series.server";

/*
 * 分时图。
 *
 * 雪球默认看到的就是这张：价格线 + 均价线，左边价格刻度、右边百分比刻度，
 * 下面一条分时成交量。站内此前只有日 K，没有分时。
 *
 * 这张图的每一根刻度都以昨收为基准——涨跌配色、右侧百分比、中间那条零轴
 * 全都是。昨收拿错，整张图的颜色和百分比会一起错，而线形完全正常。
 *
 * 另一件事：上下必须以昨收为中心对称。不对称的话，一只涨 2% 的股票，
 * 那条线会贴在图的顶端，看着像涨停。
 */

const points = (
  values: readonly (readonly [string, number, number])[],
): readonly LinePoint[] =>
  values.map(([time, price, avg]) => ({
    averagePrice: avg,
    price,
    time,
    volumeShares: 10_000,
  }));

describe("the intraday chart", () => {
  it("draws the price line, the average line and the zero axis", () => {
    const html = renderToStaticMarkup(
      <IntradayChart
        market="cn"
        period="intraday"
        symbol="sh600519"
        points={points([
          ["09:30", 100, 100],
          ["09:31", 102, 101],
          ["09:32", 101, 101],
        ])}
        previousClose={100}
      />,
    );

    expect(html).toContain("<svg");
    // 两条线：价格与均价。
    expect(html).toContain("均价");
    // 昨收既是零轴，也是百分比刻度的基准。
    expect(html).toContain("100.00");
    expect(html).toContain("0.00%");
  });

  it("centres the scale on the previous close", () => {
    /*
     * 上下以昨收对称。不对称的话，一只涨 2% 的股票那条线会贴在图的顶端，
     * 看着像涨停——而每一个数字单看都是对的。
     *
     * 这里最大偏离是 +2%，所以上下界应当是 ±2%：102.00 与 98.00。
     */
    const html = renderToStaticMarkup(
      <IntradayChart
        market="cn"
        period="intraday"
        symbol="sh600519"
        points={points([
          ["09:30", 100, 100],
          ["09:31", 102, 101],
        ])}
        previousClose={100}
      />,
    );

    expect(html).toContain("102.00");
    expect(html).toContain("98.00");
    expect(html).toContain("+2.00%");
    expect(html).toContain("-2.00%");
  });

  it("says so plainly when there is no previous close", () => {
    /*
     * 没有昨收就画不了百分比刻度。硬画的话得随便挑一个基准，
     * 那条零轴会落在一个没有意义的价位上。
     */
    const html = renderToStaticMarkup(
      <IntradayChart
        market="cn"
        period="intraday"
        symbol="sh600519"
        points={points([["09:30", 100, 100]])}
        previousClose={null}
      />,
    );

    expect(html).not.toContain("%");
  });

  it("lays the axis over the whole session, not just what has arrived", () => {
    /*
     * 上午十点只有 31 个点，铺满整宽的话，那条线会一直画到图的右边缘——
     * 看着像已经收盘了。雪球是把线停在当前时刻，右边留白。
     *
     * 沪深全天 241 个点（09:30–11:30 加 13:00–15:00）。所以 10:00 这一点
     * 应当落在大约八分之一处，而不是最右端。
     */
    const html = renderToStaticMarkup(
      <IntradayChart
        market="cn"
        period="intraday"
        symbol="sh600519"
        points={points([
          ["09:30", 100, 100],
          ["10:00", 102, 101],
        ])}
        previousClose={100}
      />,
    );

    // 轴上要有完整交易时段的刻度，不是只有首尾两个。
    expect(html).toContain("11:30/13:00");
    expect(html).toContain("15:00");
  });

  it("renders nothing when there are no points", () => {
    const html = renderToStaticMarkup(
      <IntradayChart
        market="cn"
        period="intraday"
        points={[]}
        previousClose={100}
        symbol="sh600519"
      />,
    );

    expect(html).toContain("暂无分时");
    expect(html).not.toContain("<svg");
  });
});
