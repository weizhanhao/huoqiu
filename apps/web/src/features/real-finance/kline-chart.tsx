"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import styles from "./kline-chart.module.css";

/*
 * 真实日 K 线图。
 *
 * 纯展示组件：只接收已经过校验的 bars，自己不读文件、不发请求，因此
 * 服务端渲染和浏览器测试夹具里都能跑。
 *
 * 用 SVG 手绘而不是引图表库，有三个理由：
 *   1. 落地页 JS 预算 150KB，一个通用图表库就能吃掉大半；
 *   2. 这张图是静态的，不需要运行时，服务端渲染完就是最终形态；
 *   3. viewBox + 固定宽高比让版位在首帧就占住，不会出现「图加载完把下面
 *      内容顶下去」——那正是要消灭的抖动。
 *
 * 涨跌不只靠颜色区分：涨用空心实体，跌用实心实体。灰度打印或色觉差异下
 * 依然能读出方向。
 */

export type ChartBar = Readonly<{
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volume: number;
}>;

const VIEW_WIDTH = 720;
const PRICE_HEIGHT = 240;
const VOLUME_HEIGHT = 64;
const GAP = 16;
/** 底部留给日期轴。 */
const DATE_AXIS_HEIGHT = 18;
const VIEW_HEIGHT = PRICE_HEIGHT + GAP + VOLUME_HEIGHT + DATE_AXIS_HEIGHT;
const PADDING_LEFT = 8;
/** 价格区顶部内边距，给最高价那一档刻度留出字高。 */
const PRICE_TOP = 10;
/*
 * 右边留出价格刻度的位置。
 *
 * 这张图此前一个 <text> 都没有——没有价格轴、没有日期轴、没有网格线，
 * 一根 K 线画在哪个价位上完全读不出来，只能看个大致形状。雪球那张图
 * 左右两侧都有刻度，那不是装饰，是这张图能不能用的分界。
 */
const PADDING_RIGHT = 52;

/** 均线周期。A 股看盘的习惯是 5/10/20。 */
const MA_PERIODS = [5, 10, 20] as const;
/** 价格轴分几档。 */
const PRICE_TICKS = 5;

/**
 * 简单移动平均；前面不足一个周期的位置留 null，不画。
 *
 * 补零、或者拿现有的几根凑一个平均值，都是在编数字——那几天本来就还没有
 * 足够的样本，线就该从有样本的地方才开始。
 */
const movingAverage = (
  bars: readonly ChartBar[],
  period: number,
): readonly (number | null)[] =>
  bars.map((_bar, index) => {
    if (index + 1 < period) return null;
    let total = 0;
    for (let step = 0; step < period; step += 1) {
      total += bars[index - step]?.close ?? 0;
    }
    return total / period;
  });

const formatNumber = (value: number, fractionDigits = 2): string =>
  new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);

const formatVolume = (value: number): string => {
  if (value >= 100_000_000) {
    return `${formatNumber(value / 100_000_000)} 亿`;
  }
  if (value >= 10_000) {
    return `${formatNumber(value / 10_000)} 万`;
  }
  return formatNumber(value, 0);
};

/** 多久问一次。和分时图、报价头同一个节奏。 */
const REFRESH_MS = 30_000;

export function KlineChart({
  bars: initialBars,
  /*
   * 行情页把整张卡包在一个链接里，而链接里不能再放可聚焦元素——
   * 那里传 false，图退回纯展示；个股页是默认的可交互。
   */
  interactive = true,
  market,
  name,
  /*
   * 这张图画的是哪一种周期。
   *
   * 原本这里写死「日线」——个股页能切到 60 分、周 K 之后，图上画的是
   * 60 分钟的蜡烛，标题却仍写「日线 · 共 320 个交易日」。数字和图形都对，
   * 只有那行字在说另一回事。
   */
  periodLabel = "日线",
  /*
   * 给了周期就自己刷新。
   *
   * /markets 那一页把整张图包在链接里、只做展示，不传这个，也就不轮询——
   * 一屏十几张图各自定时问一遍上游，是白白的开销。
   */
  refreshPeriod,
  sourceLabel,
  symbol,
}: Readonly<{
  bars: readonly ChartBar[];
  interactive?: boolean;
  refreshPeriod?: string;
  market: string;
  name: string;
  periodLabel?: string;
  sourceLabel: string;
  symbol: string;
}>) {
  /*
   * K 线自己动起来。当日那根蜡烛在收盘前一直在变——最高、最低、收盘都会
   * 动。停在打开页面那一刻，等于把一根还没走完的蜡烛当成已经定型的。
   *
   * 只在取到新数据时替换：请求失败保持原样，不清空。
   */
  const [bars, setBars] = useState(initialBars);

  /*
   * 服务端换了周期或标的，就以那一份为准。
   *
   * 在渲染期比对上一次的 props，而不是放进 effect：effect 版本会先拿旧数据
   * 画完这一帧、提交、再重画一次，中间那一帧画的是上一个周期的线——切换
   * 周期时看得见一次错位闪动。渲染期改状态 React 会直接重跑这一帧，
   * 那一帧根本不会被提交。
   */
  const [seenBars, setSeenBars] = useState(initialBars);
  if (seenBars !== initialBars) {
    setSeenBars(initialBars);
    setBars(initialBars);
  }

  useEffect(() => {
    if (refreshPeriod === undefined) return undefined;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/market/chart?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(refreshPeriod)}`,
          );
          if (!response.ok || cancelled) return;
          const data = (await response.json()) as {
            bars?: readonly {
              close: number;
              date: string;
              high: number;
              low: number;
              open: number;
              volumeShares: number;
            }[];
          };
          if (cancelled || data.bars === undefined || data.bars.length === 0) {
            return;
          }
          setBars(
            data.bars.map((bar) => ({
              close: bar.close,
              date: bar.date,
              high: bar.high,
              low: bar.low,
              open: bar.open,
              volume: bar.volumeShares,
            })),
          );
        } catch {
          /* 这一次没问到，保持原样，下一轮再说。 */
        }
      })();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshPeriod, symbol]);

  /*
   * 光标停在第几根上。null 表示没停在图上——这时不画十字线，
   * 头部显示的是最后一根（也就是最新收盘），和不交互时一致。
   */
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (bars.length < 2) {
    return (
      <section className={styles.chartCard} aria-label={`${name} 日K线`}>
        <p className={styles.empty}>
          该标的的真实行情快照尚未生成，暂不显示 K 线。
        </p>
      </section>
    );
  }

  /*
   * 头部那一栏跟着光标走。
   *
   * 停在哪一根就报哪一根的数——只能看最后一根的图等于没法回看，而回看
   * 正是 K 线的用处。没停在图上时回到最新收盘。
   */
  const active = cursor === null ? bars.length - 1 : cursor;
  const latest = bars[active] as ChartBar;
  const previous = (bars[active - 1] ?? bars[0]) as ChartBar;
  const change = latest.close - previous.close;
  const changePct = previous.close === 0 ? 0 : (change / previous.close) * 100;
  const rising = change >= 0;

  const highest = Math.max(...bars.map((bar) => bar.high));
  const lowest = Math.min(...bars.map((bar) => bar.low));
  const span = highest - lowest || 1;
  const maxVolume = Math.max(...bars.map((bar) => bar.volume)) || 1;

  const usableWidth = VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const slot = usableWidth / bars.length;
  // 实体最细也留 1px，否则窄屏上密集区会整片消失。
  const bodyWidth = Math.max(1, slot * 0.62);

  /*
   * 顶部留 10。不留的话最高价正好落在 y=0：那一档刻度的字被裁掉一半，
   * 最高价那根的影线也贴着上边缘，看着像画出界了。
   */
  const priceY = (value: number): number =>
    PRICE_TOP +
    (PRICE_HEIGHT - PRICE_TOP) -
    ((value - lowest) / span) * (PRICE_HEIGHT - PRICE_TOP);
  const barX = (index: number): number =>
    PADDING_LEFT + slot * index + slot / 2;

  /* 价格刻度：区间最低到最高之间等分，含两端。 */
  const priceTicks = Array.from(
    { length: PRICE_TICKS },
    (_unused, index) => lowest + (span / (PRICE_TICKS - 1)) * index,
  );

  /*
   * 均线。颜色写在这里而不是 CSS 里，因为要同时用在线条和图例上，
   * 两处必须是同一个值——分开写迟早会对不上。
   */
  const MA_COLORS = ["#E8A33D", "#3D8BE8", "#B45BD8"] as const;
  const maLines = MA_PERIODS.map((period, index) => {
    const series = movingAverage(bars, period);
    const points = series
      .flatMap((value, barIndex) =>
        value === null ? [] : [`${barX(barIndex)},${priceY(value)}`],
      )
      .join(" ");
    return { color: MA_COLORS[index] ?? "#888", period, points };
  }).filter((line) => line.points.length > 0);

  /*
   * 鼠标位置换算成第几根。
   *
   * 用 viewBox 的坐标算，不用像素：SVG 会被缩放，拿 clientX 直接比会在
   * 不同宽度下偏掉一整根。
   */
  const indexFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return active;
    const viewX = ((event.clientX - box.left) / box.width) * VIEW_WIDTH;
    const index = Math.round((viewX - PADDING_LEFT - slot / 2) / slot);
    return Math.min(bars.length - 1, Math.max(0, index));
  };

  const moveCursor = (event: KeyboardEvent<SVGSVGElement>): void => {
    const step =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    // 方向键在图上是移动光标，不该同时把页面也滚走。
    event.preventDefault();
    setCursor((current) => {
      const from = current ?? bars.length - 1;
      return Math.min(bars.length - 1, Math.max(0, from + step));
    });
  };

  /* 日期轴：首尾各一个，中间等距补两个，四个点足够定位。 */
  const dateTicks = [0, 1, 2, 3].flatMap((step) => {
    const index = Math.min(
      bars.length - 1,
      Math.round(((bars.length - 1) / 3) * step),
    );
    const bar = bars[index];
    if (bar === undefined) return [];
    return [
      {
        anchor: step === 0 ? "start" : step === 3 ? "end" : "middle",
        date: bar.date,
        x: step === 0 ? PADDING_LEFT : barX(index),
      } as const,
    ];
  });

  return (
    <section className={styles.chartCard} aria-label={`${name} 日K线`}>
      <header className={styles.chartHeading}>
        <div>
          {/*
            这张卡的标题用 h3：页面 h1 是「行情中心」，其下的区块是 h2，
            单张图表挂在区块之下。此前它是排在 h1 之前的 h3——
            大纲上凭空多出八个孤立的三级标题。
          */}
          <h3>
            {name}
            <span className={styles.symbol}>{symbol}</span>
          </h3>
          <p className={styles.market}>
            {market === "" ? null : `${market} · `}
            {periodLabel} · 共 {bars.length} 根
          </p>
        </div>
        <div className={styles.quote}>
          <strong className={rising ? styles.up : styles.down}>
            {formatNumber(latest.close, latest.close >= 100 ? 2 : 3)}
          </strong>
          <span className={rising ? styles.up : styles.down}>
            {rising ? "+" : ""}
            {formatNumber(change)}（{rising ? "+" : ""}
            {formatNumber(changePct)}%）
          </span>
          <small>{latest.date} 收盘</small>
        </div>
      </header>

      {/*
        preserveAspectRatio 用默认的 meet，不再用 none。
        none 会把横竖按各自的比例拉伸——1px 的描边在两个方向上粗细不一样，
        K 线实体也跟着变形，看着就是「不太对」但说不出哪里不对。
      */}
      {/*
        role 从 img 换成 application 之外的普通图形并加上 tabIndex：
        这张图现在能用方向键逐根查看，键盘用户得够得到它。
      */}
      <svg
        aria-label={
          interactive
            ? `${name} 日K线，可用左右方向键逐根查看`
            : `${name} 日K线`
        }
        className={styles.chart}
        onKeyDown={interactive ? moveCursor : undefined}
        onPointerLeave={interactive ? () => setCursor(null) : undefined}
        onPointerMove={
          interactive
            ? (event) => setCursor(indexFromPointer(event))
            : undefined
        }
        ref={svgRef}
        role="img"
        tabIndex={interactive ? 0 : -1}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      >
        <title>{`${name} 从 ${bars[0]?.date} 到 ${latest.date} 的日K线，区间最高 ${formatNumber(highest)}，最低 ${formatNumber(lowest)}`}</title>

        {/* 价格网格与右侧刻度。没有它，图上任何一根 K 线都读不出价位。 */}
        {priceTicks.map((value) => (
          <g className={styles.axis} key={value}>
            <line
              x1={PADDING_LEFT}
              x2={VIEW_WIDTH - PADDING_RIGHT}
              y1={priceY(value)}
              y2={priceY(value)}
            />
            <text
              dominantBaseline="middle"
              x={VIEW_WIDTH - PADDING_RIGHT + 6}
              y={priceY(value)}
            >
              {formatNumber(value, value >= 100 ? 1 : 2)}
            </text>
          </g>
        ))}

        {/* 成交量顶部的一条基准线，让柱子的高低有个参照。 */}
        <g className={styles.axis}>
          <line
            x1={PADDING_LEFT}
            x2={VIEW_WIDTH - PADDING_RIGHT}
            y1={PRICE_HEIGHT + GAP}
            y2={PRICE_HEIGHT + GAP}
          />
          <text
            dominantBaseline="middle"
            x={VIEW_WIDTH - PADDING_RIGHT + 6}
            y={PRICE_HEIGHT + GAP + 6}
          >
            {formatVolume(maxVolume)}
          </text>
        </g>

        {bars.map((bar, index) => {
          const x = PADDING_LEFT + slot * index + slot / 2;
          const barRising = bar.close >= bar.open;
          const bodyTop = priceY(Math.max(bar.open, bar.close));
          const bodyBottom = priceY(Math.min(bar.open, bar.close));
          // 开盘价等于收盘价时实体高度为 0，补到 1px 才画得出来。
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const volumeHeight = (bar.volume / maxVolume) * VOLUME_HEIGHT;

          return (
            <g
              className={barRising ? styles.upStroke : styles.downStroke}
              key={bar.date}
            >
              <line
                strokeWidth={1}
                x1={x}
                x2={x}
                y1={priceY(bar.high)}
                y2={priceY(bar.low)}
              />
              <rect
                fill={barRising ? "none" : "currentColor"}
                height={bodyHeight}
                strokeWidth={1}
                width={bodyWidth}
                x={x - bodyWidth / 2}
                y={bodyTop}
              />
              <rect
                fill="currentColor"
                height={volumeHeight}
                opacity={0.55}
                stroke="none"
                width={bodyWidth}
                x={x - bodyWidth / 2}
                y={PRICE_HEIGHT + GAP + VOLUME_HEIGHT - volumeHeight}
              />
            </g>
          );
        })}

        {/*
          均线。数值全部由传入的收盘价算出，样本不足的开头几天不画——
          不足一个周期就补一个平均值，等于凭空造一段线。
        */}
        {maLines.map((line) => (
          <polyline
            className={styles.maLine}
            fill="none"
            key={line.period}
            points={line.points}
            strokeWidth={1.2}
            style={{ stroke: line.color }}
          />
        ))}

        {/*
          十字光标。只在真的停在图上时画——不停时画一条竖线在最后一根上，
          会被当成某种标记线。
        */}
        {cursor === null ? null : (
          <g className={styles.crosshair}>
            <line
              x1={barX(cursor)}
              x2={barX(cursor)}
              y1={PRICE_TOP}
              y2={PRICE_HEIGHT + GAP + VOLUME_HEIGHT}
            />
            <line
              x1={PADDING_LEFT}
              x2={VIEW_WIDTH - PADDING_RIGHT}
              y1={priceY(latest.close)}
              y2={priceY(latest.close)}
            />
            {/* 光标那一档的价格贴在右轴上，盖住底下的常规刻度。 */}
            <rect
              className={styles.crosshairTag}
              height={14}
              rx={2}
              width={46}
              x={VIEW_WIDTH - PADDING_RIGHT + 2}
              y={priceY(latest.close) - 7}
            />
            <text
              className={styles.crosshairValue}
              dominantBaseline="middle"
              x={VIEW_WIDTH - PADDING_RIGHT + 6}
              y={priceY(latest.close)}
            >
              {formatNumber(latest.close, latest.close >= 100 ? 1 : 2)}
            </text>
          </g>
        )}

        {/* 日期轴：起止各一个，中间等距补两个。 */}
        {dateTicks.map((tick) => (
          <text
            className={styles.axis}
            key={tick.date}
            textAnchor={tick.anchor}
            x={tick.x}
            y={VIEW_HEIGHT - 4}
          >
            {tick.date.slice(2)}
          </text>
        ))}
      </svg>

      {/*
        光标那一根的明细。
        常驻而不是浮层：浮层会盖住 K 线本身，而且触屏上没有 hover，
        浮层等于摸不到。没停在图上时显示最后一根，位置固定不跳。
      */}
      {interactive ? (
        <dl aria-live="polite" className={styles.readout}>
          <div>
            <dt>日期</dt>
            <dd>{latest.date}</dd>
          </div>
          <div>
            <dt>开</dt>
            <dd>{formatNumber(latest.open, latest.open >= 100 ? 2 : 3)}</dd>
          </div>
          <div>
            <dt>高</dt>
            <dd>{formatNumber(latest.high, latest.high >= 100 ? 2 : 3)}</dd>
          </div>
          <div>
            <dt>低</dt>
            <dd>{formatNumber(latest.low, latest.low >= 100 ? 2 : 3)}</dd>
          </div>
          <div>
            <dt>收</dt>
            <dd className={rising ? styles.up : styles.down}>
              {formatNumber(latest.close, latest.close >= 100 ? 2 : 3)}
            </dd>
          </div>
          <div>
            <dt>涨跌幅</dt>
            <dd className={rising ? styles.up : styles.down}>
              {rising ? "+" : ""}
              {formatNumber(changePct)}%
            </dd>
          </div>
          <div>
            <dt>成交量</dt>
            <dd>{formatVolume(latest.volume)}</dd>
          </div>
        </dl>
      ) : null}

      {/* 均线图例：不说明哪条线是哪条，三条线就只是三条颜色。 */}
      <ul className={styles.legend}>
        {maLines.map((line) => (
          <li key={line.period}>
            <span aria-hidden="true" style={{ background: line.color }} />
            MA{line.period}
          </li>
        ))}
      </ul>

      <dl className={styles.stats}>
        <div>
          <dt>区间最高</dt>
          <dd>{formatNumber(highest)}</dd>
        </div>
        <div>
          <dt>区间最低</dt>
          <dd>{formatNumber(lowest)}</dd>
        </div>
        <div>
          <dt>最新成交量</dt>
          <dd>{formatVolume(latest.volume)}</dd>
        </div>
        <div>
          <dt>起始日期</dt>
          <dd>{bars[0]?.date}</dd>
        </div>
      </dl>

      <p className={styles.source}>{sourceLabel}</p>
    </section>
  );
}
