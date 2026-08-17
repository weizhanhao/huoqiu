import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ChartBar, ChartPoint } from "../../../src/api/market-api";
import { PriceChart } from "../../../src/components/instrument/price-chart";

/*
 * 分时与 K 线。
 *
 * 图是这一页最容易「看着有、其实错」的东西：算错高度只是形状怪一点，不报错，
 * 也没人会去核对。所以这里守的是几条能把图画废的边界。
 */

const bar = (
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
): ChartBar => ({ close, date, high, low, open, volumeShares: 1000 });

const point = (time: string, price: number): ChartPoint => ({
  averagePrice: price,
  price,
  time,
  volumeShares: 1000,
});

describe("price chart", () => {
  it("makes the minute-chart axis readable", () => {
    /*
     * 分钟级周期上游给的 date 是 202604221030 这样一串十二位数。原样印在坐标
     * 轴上，图底下就是两串谁也读不出来的数字——图本身画得对，报错也没有，
     * 只有那两个刻度废了。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{
          bars: [
            bar("202604221030", 10, 11, 9, 10.5),
            bar("202608171500", 10.5, 12, 10, 11.8),
          ],
          kind: "candle",
          period: "m60",
        }}
      />,
    );

    expect(markup).toContain("04-22 10:30");
    expect(markup).toContain("08-17 15:00");
    expect(markup).not.toContain("202604221030");
  });

  it("leaves a day-level date alone", () => {
    /* 日/周/月本来就是 2026-08-17，别自作聪明再切一遍。 */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{
          bars: [
            bar("2026-08-14", 10, 11, 9, 10.5),
            bar("2026-08-17", 10.5, 12, 10, 11.8),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    expect(markup).toContain("2026-08-14");
    expect(markup).toContain("2026-08-17");
  });

  it("says it could not fetch instead of drawing an empty frame", () => {
    const markup = renderToStaticMarkup(
      <PriceChart
        failure="连不上服务器。确认手机和服务在同一个网络里。"
        loading={false}
        previousClose={null}
        series={null}
      />,
    );

    expect(markup).toContain("连不上服务器");
  });

  it("distinguishes a session with no trades from a failed fetch", () => {
    /*
     * 「这一段没有成交」和「取不到」是两件事。混成一句，停牌的票看起来像
     * 系统坏了，而真的坏了又看起来像停牌。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={10}
        series={{ kind: "line", period: "intraday", points: [] }}
      />,
    );

    expect(markup).toContain("没有成交");
    expect(markup).not.toContain("取不到");
  });

  it("survives a limit-up day where every price is identical", () => {
    /*
     * 一字板和停牌会让最高等于最低，高度算式的分母就是 0——不处理的话整段
     * 样式变成 NaN，图直接不显示，而控制台一声不吭。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={10}
        series={{
          bars: [
            bar("2026-08-14", 10, 10, 10, 10),
            bar("2026-08-15", 10, 10, 10, 10),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    expect(markup).not.toContain("NaN");
    expect(markup).toContain("2026-08-14");
  });

  it("keeps a flat day visible instead of collapsing it to nothing", () => {
    /*
     * 开盘价等于收盘价时实体高度是 0。不给下限的话，那一天会从图上整根消失，
     * 看图的人以为那天没有交易。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={10}
        series={{
          bars: [
            bar("2026-08-14", 10, 12, 9, 11),
            bar("2026-08-15", 11, 11.5, 10.5, 11),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    expect(markup).toContain("2026-08-15");
    expect(markup).not.toContain("height:0px");
  });

  it("labels both ends of an intraday session", () => {
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={10}
        series={{
          kind: "line",
          period: "intraday",
          points: [point("09:30", 10), point("15:00", 11)],
        }}
      />,
    );

    expect(markup).toContain("09:30");
    expect(markup).toContain("15:00");
  });
});
