"use client";

import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import styles from "./trading-chart.module.css";
import type { ChartSeries } from "../../server/chart-series.server";

/*
 * 行情图。
 *
 * 用 TradingView 的 lightweight-charts 画，不再自己拿 canvas 一根根摆。
 *
 * 自己画的那一版问题不在某一处：坐标轴印的是 `2608170939` 这种原始串、蜡烛挤成
 * 一片、十字光标和读数都得自己实现、量能区和主图各算各的比例。这些都是成熟图表
 * 库早就解决过的问题，而且解决得比手写好——命中测试、刻度取舍、拖动缩放都是
 * 现成的。
 *
 * 时间轴用「序号映射」而不是真实时间戳：上游给的 date 形状各周期都不一样
 * （2026-08-17 / 2026Q3 / 202608171030 / 09:30），换算成时间戳既要处理时区又要
 * 处理非交易时段的空档——而 A 股的图从来不画午休那一个半小时。所以给每根一个
 * 等距的假时间，再用 tickMarkFormatter 把原始标签换回去：轴上显示的永远是数据
 * 自己带的那个标签，中间不经过任何时区换算。
 */

/* A 股红涨绿跌。 */
const UP = "#cf2f38";
const DOWN = "#137b55";
const AVERAGE = "#f0a020";
const INTRADAY = "#2b7fd4";
const GRID = "#f0f2f5";
const AXIS_TEXT = "#8a9199";

/** 均线：窗口与颜色。 */
const MA_LINES = [
  { color: "#f0a020", window: 5 },
  { color: "#2e86de", window: 10 },
  { color: "#b558c8", window: 20 },
] as const;

const movingAverage = (
  values: readonly number[],
  window: number,
): readonly (number | null)[] => {
  const out: (number | null)[] = [];
  let sum = 0;
  for (const [index, value] of values.entries()) {
    sum += value;
    if (index >= window) sum -= values[index - window] ?? 0;
    out.push(index >= window - 1 ? sum / window : null);
  }
  return out;
};

/*
 * 轴上的标签。
 *
 * 分钟级上游给的是 202608171030 这样一串十二位数，原样印出来没人读得出来；
 * 日/周/月截到月，刻度写到日会挤成一团。
 */
const axisLabel = (raw: string): string => {
  if (/^\d{12}$/u.test(raw)) {
    return `${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw.slice(0, 7);
  return raw;
};

/** 等距假时间：第 index 根落在 index+1 秒上，显示全靠 formatter 换回来。 */
const timeAt = (index: number): UTCTimestamp => (index + 1) as UTCTimestamp;

export function TradingChart({
  previousClose,
  series,
}: Readonly<{ previousClose: number | null; series: ChartSeries }>) {
  const host = useRef<HTMLDivElement | null>(null);
  const [readout, setReadout] = useState("");

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    /* 原始标签按序号存一份，轴和十字光标都从这里取。 */
    const labels =
      series.kind === "candle"
        ? series.bars.map((bar) => axisLabel(bar.date))
        : series.points.map((point) => point.time);

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      crosshair: {
        horzLine: { color: AXIS_TEXT, labelBackgroundColor: "#5b6470" },
        mode: 0,
        vertLine: { color: AXIS_TEXT, labelBackgroundColor: "#5b6470" },
      },
      grid: { horzLines: { color: GRID }, vertLines: { color: GRID } },
      layout: {
        attributionLogo: false,
        background: { color: "#ffffff" },
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif',
        fontSize: 11,
        panes: { separatorColor: GRID, separatorHoverColor: GRID },
        textColor: AXIS_TEXT,
      },
      /* 价格轴放左边，和雪球一致。 */
      leftPriceScale: {
        borderVisible: false,
        scaleMargins: { bottom: 0.06, top: 0.08 },
        visible: true,
      },
      rightPriceScale: { visible: false },
      timeScale: {
        borderVisible: false,
        /* 轴上显示的永远是数据自带的标签，不做任何时区换算。 */
        tickMarkFormatter: (time: UTCTimestamp) =>
          labels[Number(time) - 1] ?? "",
      },
    });

    if (series.kind === "line") {
      const { points } = series;
      const price = chart.addSeries(AreaSeries, {
        bottomColor: "rgba(43,127,212,0.03)",
        lineColor: INTRADAY,
        lineWidth: 2,
        priceScaleId: "left",
        topColor: "rgba(43,127,212,0.20)",
      });
      price.setData(
        points.map((point, index) => ({
          time: timeAt(index),
          value: point.price,
        })),
      );

      const average = chart.addSeries(LineSeries, {
        color: AVERAGE,
        lineWidth: 1,
        priceLineVisible: false,
        priceScaleId: "left",
      });
      average.setData(
        points.map((point, index) => ({
          time: timeAt(index),
          value: point.averagePrice,
        })),
      );

      /*
       * 昨收那条基准线。
       * 看分时的人读的是「离昨收多远」，没有它，涨还是跌只能靠读数字。
       */
      if (previousClose !== null) {
        price.createPriceLine({
          color: "#b9c0c8",
          lineStyle: 2,
          lineWidth: 1,
          price: previousClose,
          title: "昨收",
        });
      }

      const volume = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "" },
        1,
      );
      volume.setData(
        points.map((point, index) => ({
          color:
            point.price >= (points[index - 1]?.price ?? point.price) ? UP : DOWN,
          time: timeAt(index),
          value: point.volumeShares,
        })),
      );
    } else {
      const { bars } = series;
      const candles = chart.addSeries(CandlestickSeries, {
        /* 阳线空心：描边给涨色，实体填白。这是 A 股 K 线的固有读法。 */
        borderDownColor: DOWN,
        borderUpColor: UP,
        downColor: DOWN,
        priceScaleId: "left",
        upColor: "#ffffff",
        wickDownColor: DOWN,
        wickUpColor: UP,
      });
      candles.setData(
        bars.map((bar, index) => ({
          close: bar.close,
          high: bar.high,
          low: bar.low,
          open: bar.open,
          time: timeAt(index),
        })),
      );

      const closes = bars.map((bar) => bar.close);
      for (const line of MA_LINES) {
        const shaped = movingAverage(closes, line.window).flatMap(
          (value, index) =>
            value === null ? [] : [{ time: timeAt(index), value }],
        );
        if (shaped.length < 2) continue;
        chart
          .addSeries(LineSeries, {
            color: line.color,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            lineWidth: 1,
            priceLineVisible: false,
            priceScaleId: "left",
          })
          .setData(shaped);
      }

      const volume = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "" },
        1,
      );
      volume.setData(
        bars.map((bar, index) => ({
          color: bar.close >= bar.open ? UP : DOWN,
          time: timeAt(index),
          value: bar.volumeShares,
        })),
      );
    }

    /* 量能区约占三成高度，和雪球的比例接近。 */
    const panes = chart.panes();
    panes[0]?.setHeight(260);
    panes[1]?.setHeight(92);

    /*
     * 跟手读数。
     *
     * 十字光标是库自带的，但读数要自己组织——一张 K 线图最常被问的就是
     * 「这根是哪天、多少钱」。
     */
    chart.subscribeCrosshairMove((parameters) => {
      const index = Number(parameters.time ?? 0) - 1;
      if (!Number.isFinite(index) || index < 0) {
        setReadout("");
        return;
      }
      if (series.kind === "candle") {
        const bar = series.bars[index];
        if (bar === undefined) return;
        const percent =
          bar.open === 0 ? 0 : ((bar.close - bar.open) / bar.open) * 100;
        setReadout(
          `${bar.date} · 开 ${bar.open.toFixed(2)} · 高 ${bar.high.toFixed(2)} · 低 ${bar.low.toFixed(2)} · 收 ${bar.close.toFixed(2)} · ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`,
        );
        return;
      }
      const point = series.points[index];
      if (point === undefined) return;
      const percent =
        previousClose === null || previousClose === 0
          ? null
          : ((point.price - previousClose) / previousClose) * 100;
      setReadout(
        `${point.time} · 价 ${point.price.toFixed(2)}${
          percent === null
            ? ""
            : ` · ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`
        } · 均价 ${point.averagePrice.toFixed(2)}`,
      );
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [previousClose, series]);

  return (
    <div className={styles.wrapper}>
      {/*
        读数条占固定一行，不做悬浮气泡：气泡会盖住正在看的那一段，而这一行
        恰恰是为了读那一段。空态的高度由 CSS 的 min-height 撑住，不塞占位字符
        ——否则整张图会在鼠标进出时上下跳一格。
      */}
      <p className={styles.readout}>{readout}</p>
      <div className={styles.chart} ref={host} />
    </div>
  );
}
