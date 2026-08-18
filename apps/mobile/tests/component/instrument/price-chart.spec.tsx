import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ChartBar, ChartPoint } from "../../../src/api/market-api";
import {
  barIndexAt,
  movingAverage,
} from "../../../src/components/instrument/chart-bounds";
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

describe("moving average", () => {
  it("leaves the first bars empty instead of pretending they are zero", () => {
    /*
     * 前四根算不出 MA5——那是事实。补 0 的话线会从图底拔地而起，
     * 看图的人以为那几天真的跌到过零。
     */
    expect(movingAverage([1, 2, 3, 4, 5], 5)).toEqual([
      null,
      null,
      null,
      null,
      3,
    ]);
  });

  it("slides the window instead of averaging everything so far", () => {
    /* 第 6 个位置是 (2+3+4+5+6)/5 = 4，不是全部六个数的平均。 */
    expect(movingAverage([1, 2, 3, 4, 5, 6], 5)?.[5]).toBe(4);
  });
});

describe("bar index under a finger", () => {
  /*
   * 十字光标读的就是这个函数。算错的表现不是报错，是「线停在别处」——
   * 用户瞄第一根，读数给的是第二根，而两根的数字都是真的。
   */
  it("maps the left edge to the first bar and the right edge to the last", () => {
    expect(barIndexAt(0, 300, 10)).toBe(0);
    expect(barIndexAt(299, 300, 10)).toBe(9);
  });

  it("clamps a finger that slid past either edge", () => {
    /* 手指划出图外时 locationX 会是负数或超出宽度，正好发生在想看头尾的时候。 */
    expect(barIndexAt(-40, 300, 10)).toBe(0);
    expect(barIndexAt(999, 300, 10)).toBe(9);
  });

  it("does not divide by a width it has not measured yet", () => {
    /* 布局还没量到时宽度是 0，除下去是 NaN，样式会整块失效。 */
    expect(barIndexAt(120, 0, 10)).toBe(0);
    expect(barIndexAt(120, 300, 0)).toBe(0);
  });
});

/** 数一种 SVG 节点出现了几次。 */
const countOf = (markup: string, tag: string): number =>
  markup.split(`<RNSVG${tag}`).length - 1;

describe("price chart", () => {
  it("draws each moving average as one path, not a row of blocks", () => {
    /*
     * 上一版的均线是「每一列填一个矩形」——年K 只有十几根时每段有二十多点宽，
     * 整张图是一堆彩色阶梯色块。一条均线就该是一条线，也就是一个 <Path>。
     */
    const bars = Array.from({ length: 25 }, (_, index) =>
      bar(
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        10,
        11 + index * 0.1,
        9,
        10 + index * 0.1,
      ),
    );
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{ bars, kind: "candle", period: "day" }}
      />,
    );

    /* 三条均线 = 三个 Path，不是几十个方块。 */
    expect(countOf(markup, "Path")).toBe(3);
    /* 每个 Path 都得是真的折线：多个 L 指令连起来。 */
    const path = /d="(?<d>M[^"]+)"/u.exec(markup)?.groups?.d ?? "";
    expect(path.split("L").length).toBeGreaterThan(10);
  });

  it("caps the candle body so a 14-bar year chart is not a row of slabs", () => {
    /*
     * 根数少时只让间隙变大，不让实体变胖。不封顶的话年K 每根会撑到二十多点，
     * 一屏十几个大色块。
     */
    const bars = Array.from({ length: 14 }, (_, index) =>
      bar(`20${String(index + 12)}`, 10, 12, 9, 11),
    );
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{ bars, kind: "candle", period: "year" }}
      />,
    );

    const widths = [...markup.matchAll(/width="(?<w>[0-9.]+)"/gu)].map(
      (found) => Number(found.groups?.w),
    );
    /* 实体宽上限 11；画布本身的宽度会更大，所以只看蜡烛那一档。 */
    const bodyWidths = widths.filter((value) => value > 0 && value < 100);
    expect(Math.max(...bodyWidths)).toBeLessThanOrEqual(11);
  });

  it("outlines a rising candle instead of filling it", () => {
    /*
     * 阳线空心、阴线实心，是 A 股 K 线的固有读法，也是颜色之外的第二层编码
     * ——色觉障碍的人只剩这一层可用。空心的内部必须是画布底色而不是透明：
     * 影线是整根贯通画的，透明底会让它从实体中间穿过去，成了个「井」字。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{
          bars: [
            bar("2026-08-14", 10, 12, 9, 11.5),
            bar("2026-08-17", 11.5, 12, 10, 11.8),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    /* 空心是靠描边表达的：涨的那根必须有 stroke-width。 */
    expect(markup).toContain('stroke-width="1"');
    expect(countOf(markup, "Rect")).toBeGreaterThanOrEqual(2);
  });

  it("draws the grid and the price ticks a reader needs", () => {
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{
          bars: [
            bar("2026-08-14", 10, 12, 9, 11.5),
            bar("2026-08-17", 11.5, 14, 10, 13),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    /* 五条横线 + 三条竖线，是雪球那张图的骨架。 */
    expect(countOf(markup, "Line")).toBeGreaterThanOrEqual(8);
    /* 纵轴刻度：最高与最低必须出现在刻度里。 */
    expect(markup).toContain("14.00");
    expect(markup).toContain("9.00");
  });

  it("draws the intraday line as one connected path, not loose dots", () => {
    /*
     * 上一版每个点画一个 2px 方块，屏幕上是一片断续的绿点——形状勉强看得出来，
     * 但那不是一条线。现在价格线、均价线、面积填充各是一个 Path。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={10}
        series={{
          kind: "line",
          period: "intraday",
          points: [point("09:30", 10), point("09:31", 12), point("09:32", 11)],
        }}
      />,
    );

    /* 面积 + 均价线 + 价格线。 */
    expect(countOf(markup, "Path")).toBe(3);
    /* 面积那条要沿底边收口，否则填充会变成一个三角形。 */
    expect(markup).toContain("Z");
  });

  it("lets you read the intraday chart by touch too", () => {
    /* 用户原话：「分时线不可交互是个问题」。 */
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

    expect(markup).toContain('data-testid="price-chart-canvas"');
    /* 读数条：时间、价、均价——和 K 线那条同一个位置。 */
    expect(markup).toContain("最新 15:00");
    expect(markup).toContain("价 11.00");
    expect(markup).toContain("均价 11.00");
  });

  it("shows the moving averages a K-line reader expects", () => {
    const bars = Array.from({ length: 25 }, (_, index) =>
      bar(
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        10,
        11,
        9,
        10 + index * 0.1,
      ),
    );
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{ bars, kind: "candle", period: "day" }}
      />,
    );

    expect(markup).toContain("MA5");
    expect(markup).toContain("MA10");
    expect(markup).toContain("MA20");
    /* 25 根足够算出 MA20，那一格不该是破折号。 */
    expect(markup).not.toContain("MA20 —");
  });

  it("shows the latest bar's numbers before anyone touches it", () => {
    /*
     * 柱子只有两三个像素宽，光看图读不出「这根是哪天、多少钱」。默认先把最新
     * 一根的开高低收摆出来，按住拖动时再跟着手指走。
     */
    const markup = renderToStaticMarkup(
      <PriceChart
        failure={null}
        loading={false}
        previousClose={null}
        series={{
          bars: [
            bar("2026-08-14", 10, 11, 9, 10.5),
            bar("2026-08-17", 10.5, 12.25, 10.1, 11.8),
          ],
          kind: "candle",
          period: "day",
        }}
      />,
    );

    expect(markup).toContain("最新 2026-08-17");
    expect(markup).toContain("开 10.50");
    expect(markup).toContain("高 12.25");
    expect(markup).toContain("低 10.10");
    expect(markup).toContain("收 11.80");
  });

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

    /* 轴上的刻度截到月——三个刻度写到日会挤成一团。 */
    expect(markup).toContain("2026-08");
    /* 读数条上写全，它回答的正是「这根是哪一天」。 */
    expect(markup).toContain("最新 2026-08-17");
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
    expect(markup).toContain("2026-08");
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

    expect(markup).toContain("2026-08");
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
