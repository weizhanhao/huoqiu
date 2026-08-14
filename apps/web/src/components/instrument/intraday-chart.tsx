"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";

import styles from "./intraday-chart.module.css";
import type { LinePoint } from "../../server/chart-series.server";

/*
 * 分时图。
 *
 * 价格线 + 均价线，左边价格刻度、右边百分比刻度，下面一条分时成交量。
 * 站内此前只有日 K，没有分时。
 *
 * 这张图的每一根刻度都以昨收为基准——涨跌配色、右侧百分比、中间那条零轴
 * 全是。昨收拿错，整张图的颜色和百分比会一起错，而线形完全正常，
 * 看不出任何毛病。
 */

const VIEW_WIDTH = 720;
const PRICE_HEIGHT = 210;
const VOLUME_HEIGHT = 52;
const GAP = 12;
const TIME_AXIS_HEIGHT = 16;
const PADDING_LEFT = 56;
const PADDING_RIGHT = 56;
const PRICE_TOP = 8;

/** 上下各画这么多条参考线（含正中的零轴）。 */
const GRID_LINES = 5;

/*
 * 各市场的交易时段。
 *
 * 横轴要按**全天**布，不是按已经到手的点数。上午十点只有三十来个点，
 * 铺满整宽的话那条线会一直画到右边缘——看着像已经收盘了。
 *
 * 分钟数含两端：沪深 09:30–11:30 是 121 分钟，13:00–15:00 是 121 分钟，
 * 中间那一分钟重合，全天 241 个点。
 */
const SESSIONS = {
  cn: [
    { from: "09:30", to: "11:30" },
    { from: "13:00", to: "15:00" },
  ],
  hk: [
    { from: "09:30", to: "12:00" },
    { from: "13:00", to: "16:00" },
  ],
  us: [{ from: "09:30", to: "16:00" }],
} as const;

export type IntradayMarket = keyof typeof SESSIONS;

const minutesOf = (time: string): number => {
  const [hour, minute] = time.split(":");
  return Number(hour) * 60 + Number(minute);
};

/*
 * 一个时刻在全天中排第几格。
 *
 * 午休那段不占格：11:30 与 13:00 在轴上是同一个位置，否则中午会空出
 * 一段一动不动的横线，看着像停牌了一个半小时。
 */
const slotOf = (time: string, market: IntradayMarket): number => {
  const target = minutesOf(time);
  let passed = 0;
  for (const span of SESSIONS[market]) {
    const from = minutesOf(span.from);
    const to = minutesOf(span.to);
    if (target <= to) return passed + Math.max(0, target - from);
    passed += to - from;
  }
  return passed;
};

const sessionSlots = (market: IntradayMarket): number =>
  SESSIONS[market].reduce(
    (total, span) => total + (minutesOf(span.to) - minutesOf(span.from)),
    0,
  );

/*
 * 轴上的时间刻度，每半小时一格。
 *
 * 午休两侧的刻度合成一个（11:30/13:00）——那是同一个位置上的两个时刻，
 * 分开写会让人以为中间还有一段。
 */
const axisTicksOf = (
  market: IntradayMarket,
): readonly Readonly<{ label: string; slot: number }>[] => {
  const ticks: { label: string; slot: number }[] = [];
  let passed = 0;
  for (const [index, span] of SESSIONS[market].entries()) {
    const from = minutesOf(span.from);
    const to = minutesOf(span.to);
    for (let minute = from; minute <= to; minute += 30) {
      const label = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
        minute % 60,
      ).padStart(2, "0")}`;
      const slot = passed + (minute - from);
      const previous = ticks.at(-1);
      if (index > 0 && previous?.slot === slot) {
        previous.label = `${previous.label}/${label}`;
        continue;
      }
      ticks.push({ label, slot });
    }
    passed += to - from;
  }
  return ticks;
};

const VIEW_HEIGHT =
  PRICE_TOP + PRICE_HEIGHT + GAP + VOLUME_HEIGHT + TIME_AXIS_HEIGHT;

const formatPrice = (value: number): string => value.toFixed(2);

const formatPercent = (value: number): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

/*
 * 成交量按万/亿说。
 *
 * 七位数字带千分位要数位数才知道量级，而这个数每分钟都在跳——
 * A 股用户读的本来就是「万/亿」。
 */
const formatShares = (value: number): string => {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return Math.round(value).toLocaleString("zh-CN");
};

/** 多久问一次。分时是分钟级的，再密也没有新东西，只是白压上游。 */
const REFRESH_MS = 30_000;

export function IntradayChart({
  market,
  period,
  points: initialPoints,
  previousClose,
  symbol,
}: Readonly<{
  /** 决定横轴按哪个市场的交易时段来布。 */
  market: IntradayMarket;
  period: string;
  points: readonly LinePoint[];
  /** 没有昨收就画不了百分比刻度——硬画得随便挑基准，零轴会落在无意义的价位上。 */
  previousClose: number | null;
  symbol: string;
}>) {
  /*
   * 分时线自己动起来。
   *
   * 一张停在打开页面那一刻的分时图，跟一张截图没有区别——而它看起来是活的。
   *
   * 只在取到新数据时替换：请求失败保持原样，不清空。清空会让图突然变成
   * 「暂无分时」，看着像这只股票停牌了，而实际上只是这一次没问到。
   */
  const [points, setPoints] = useState(initialPoints);

  /*
   * 服务端换了周期或标的，重新以那一份为准。
   *
   * 在渲染期比对上一次的 props，而不是放进 effect：effect 版本会先拿旧数据
   * 画完这一帧、提交、再重画一次，中间那一帧画的是上一个周期的线。
   * 渲染期改状态 React 会直接重跑这一帧，那一帧不会被提交。
   */
  const [seenPoints, setSeenPoints] = useState(initialPoints);
  if (seenPoints !== initialPoints) {
    setSeenPoints(initialPoints);
    setPoints(initialPoints);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/market/chart?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
          );
          if (!response.ok || cancelled) return;
          const data = (await response.json()) as {
            points?: readonly LinePoint[];
          };
          if (cancelled || data.points === undefined) return;
          if (data.points.length > 0) setPoints(data.points);
        } catch {
          /* 这一次没问到，保持原样，下一轮再说。 */
        }
      })();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period, symbol]);

  /*
   * 光标停在第几个点上。null 表示没停在图上——这时读数显示最新那一点，
   * 十字线不画。
   */
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length === 0) {
    return <p className={styles.empty}>暂无分时数据。</p>;
  }

  const prices = points.flatMap((point) => [point.price, point.averagePrice]);
  const maxVolume = Math.max(...points.map((point) => point.volumeShares), 1);

  /*
   * 上下以昨收为中心对称。
   *
   * 不对称的话，一只涨 2% 的股票那条线会贴在图的顶端，看着像涨停——
   * 而每一个数字单看都是对的。
   */
  const base = previousClose ?? prices[0] ?? 0;
  const reach = Math.max(
    ...prices.map((price) => Math.abs(price - base)),
    Math.abs(base) * 0.001,
  );
  const upper = base + reach;
  const lower = base - reach;
  const span = upper - lower || 1;

  const totalSlots = sessionSlots(market);
  const plotWidth = VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT;

  /* 横坐标按全天的第几格算，不按「第几个点」——否则半天的数据会铺满整宽。 */
  const xOfSlot = (slot: number): number =>
    PADDING_LEFT + (totalSlots === 0 ? 0 : (slot / totalSlots) * plotWidth);

  const xOf = (index: number): number =>
    xOfSlot(slotOf(points[index]?.time ?? "09:30", market));

  const yOf = (price: number): number =>
    PRICE_TOP + ((upper - price) / span) * PRICE_HEIGHT;

  const pathOf = (pick: (point: LinePoint) => number): string =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xOf(index).toFixed(2)} ${yOf(
            pick(point),
          ).toFixed(2)}`,
      )
      .join(" ");

  const volumeTop = PRICE_TOP + PRICE_HEIGHT + GAP;
  const active = cursor === null ? points.length - 1 : cursor;
  const last = points[active] as LinePoint;
  /*
   * 配色跟着光标那一点走，不是跟着最新点。
   *
   * 用 latest 的话，hover 到上午某个低于昨收的点，读数会显示一个绿色的
   * 数字却被涂成红色——数值和颜色互相打架。
   */
  const rising = last.price >= base;

  /*
   * 指针位置换算成第几个点。
   *
   * 用 getBoundingClientRect 而不是 offsetX：SVG 会按 viewBox 缩放，
   * offsetX 是 CSS 像素，两者在任何非 1:1 的宽度下都对不上——鼠标停在
   * 哪一分钟，读数给的是另一分钟。
   */
  const indexFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return active;
    const viewX = ((event.clientX - box.left) / box.width) * VIEW_WIDTH;
    /*
     * 反解成「全天第几格」，再找最近的那个点。
     *
     * 不能按「第几个点」等分反推：横坐标早已改成按全天格数排，两套映射
     * 一旦不一致，上午十点（只有三十来个点、占轴左侧八分之一）把鼠标移到
     * 图的正中，读数会给出 09:45——鼠标在这儿，十字线在那儿。
     * 半天行情和任何有缺失分钟的标的上必现。
     */
    const targetSlot =
      plotWidth === 0
        ? 0
        : ((viewX - PADDING_LEFT) / plotWidth) * totalSlots;

    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (const [index, point] of points.entries()) {
      const distance = Math.abs(slotOf(point.time, market) - targetSlot);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    return nearest;
  };

  /*
   * 刻度从上到下等分，正中间那条正好是昨收——这张图唯一的基准。
   *
   * 原先五条线一个样式，昨收那条完全看不出来。看盘第一眼要读的就是
   * 「现在在昨收上面还是下面」，而这条线是隐形的，得先数到中间那条、
   * 再确认它是不是中间那条。
   */
  const baseIndex = (GRID_LINES - 1) / 2;
  const ticks = Array.from({ length: GRID_LINES }, (_, index) => {
    const price = upper - (index / (GRID_LINES - 1)) * span;
    return {
      isBase: index === baseIndex,
      percent:
        previousClose === null || base === 0
          ? null
          : ((price - base) / base) * 100,
      price,
      /* 刻度按方向着色。位置本身已经说明了方向，颜色只是冗余强化——
         所以这里对色觉障碍没有风险。 */
      tone:
        index < baseIndex
          ? styles.up
          : index > baseIndex
            ? styles.down
            : styles.baseTick,
      y: PRICE_TOP + (index / (GRID_LINES - 1)) * PRICE_HEIGHT,
    };
  });

  return (
    <div className={styles.wrap}>
      <p className={styles.legend}>
        <span className={styles.time}>{last.time}</span>
        <span className={styles.averageKey}>
          均价 {formatPrice(last.averagePrice)}
        </span>
        <span className={rising ? styles.up : styles.down}>
          {cursor === null ? "最新" : "价格"} {formatPrice(last.price)}
          {previousClose === null || base === 0
            ? null
            : ` ${formatPercent(((last.price - base) / base) * 100)}`}
        </span>
        <span className={styles.volumeKey}>
          成交 {formatShares(last.volumeShares)}股
        </span>
      </p>

      <svg
        aria-label="分时走势"
        className={styles.chart}
        onPointerLeave={() => {
          setCursor(null);
        }}
        onPointerMove={(event) => {
          setCursor(indexFromPointer(event));
        }}
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
      >
        <g className={styles.axis}>
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line
                className={tick.isBase ? styles.baseLine : undefined}
                x1={PADDING_LEFT}
                x2={VIEW_WIDTH - PADDING_RIGHT}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                className={tick.tone}
                textAnchor="end"
                x={PADDING_LEFT - 6}
                y={tick.y + 4}
              >
                {formatPrice(tick.price)}
              </text>
              {tick.percent === null ? null : (
                <text
                  className={tick.tone}
                  x={VIEW_WIDTH - PADDING_RIGHT + 6}
                  y={tick.y + 4}
                >
                  {formatPercent(tick.percent)}
                </text>
              )}
            </g>
          ))}
        </g>

        {/*
          分时成交量。
          逐根按方向着色：这一分钟收在上一分钟之上为涨、之下为跌。
          全部同色的话，这块 52 高的区域只剩「哪分钟量大」一个信息，
          而看分时量的目的恰恰是判断放量是买上去的还是砸下来的。
        */}
        <g className={styles.volume}>
          {points.map((point, index) => {
            const reference = points[index - 1]?.price ?? base;
            return (
              <line
                className={point.price >= reference ? styles.volUp : styles.volDown}
                key={`${point.time}-${String(index)}`}
                x1={xOf(index)}
                x2={xOf(index)}
                y1={volumeTop + VOLUME_HEIGHT}
                y2={
                  volumeTop +
                  VOLUME_HEIGHT -
                  (point.volumeShares / maxVolume) * VOLUME_HEIGHT
                }
              />
            );
          })}
          {/* 峰值标注：没有它，柱高只有相对意义，换算不成手数。 */}
          <text className={styles.axisText} x={PADDING_LEFT} y={volumeTop + 9}>
            {formatShares(maxVolume)}
          </text>
        </g>

        <path
          className={styles.averageLine}
          d={pathOf((point) => point.averagePrice)}
        />
        <path
          className={rising ? styles.priceUp : styles.priceDown}
          d={pathOf((point) => point.price)}
        />

        {/*
          最新一点的圆点。横轴按全天布，右边留白是「还没到」；没有这个
          标记的话，「数据源挂了、之后再没更新」看起来一模一样。
        */}
        <circle
          className={rising ? styles.dotUp : styles.dotDown}
          cx={xOf(points.length - 1)}
          cy={yOf(points[points.length - 1]?.price ?? base)}
          r={3}
        />

        {cursor === null ? null : (
          <g className={styles.crosshair}>
            <line
              x1={xOf(active)}
              x2={xOf(active)}
              y1={PRICE_TOP}
              y2={volumeTop + VOLUME_HEIGHT}
            />
            <line
              x1={PADDING_LEFT}
              x2={VIEW_WIDTH - PADDING_RIGHT}
              y1={yOf(last.price)}
              y2={yOf(last.price)}
            />
          </g>
        )}

        {/* 时间轴按全天布，走到哪画到哪——右边的留白就是「还没到」。 */}
        <g className={styles.axis}>
          {axisTicksOf(market).map((tick, index, all) => (
            <text
              key={tick.label}
              textAnchor={
                index === 0 ? "start" : index === all.length - 1 ? "end" : "middle"
              }
              x={xOfSlot(tick.slot)}
              y={VIEW_HEIGHT - 4}
            >
              {tick.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
