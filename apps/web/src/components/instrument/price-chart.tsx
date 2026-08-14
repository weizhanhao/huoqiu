import type { D0Fixture } from "@huoqiu/contracts/d0";

import { PageState } from "../system/page-state";

type D0BarPoint = D0Fixture["bars"][number]["points"][number];

type PriceChartProperties = Readonly<{
  instrumentName: string;
  points: readonly D0BarPoint[];
  state: "normal" | "loading" | "empty" | "error";
}>;

const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const PLOT_LEFT = 42;
const PLOT_RIGHT = 18;
const PRICE_TOP = 24;
const PRICE_HEIGHT = 190;
const VOLUME_TOP = 246;
const VOLUME_HEIGHT = 48;

const toNumber = (value: string): number => Number(value);

export function PriceChart({
  instrumentName,
  points,
  state,
}: PriceChartProperties) {
  if (state !== "normal") {
    return (
      <PageState
        state={state}
        emptyMessage="暂无日 K 数据"
        errorMessage="日 K 演示数据校验失败"
      />
    );
  }

  if (points.length === 0) {
    return <PageState state="empty" emptyMessage="暂无日 K 数据" />;
  }

  const lows = points.map((point) => toNumber(point.low));
  const highs = points.map((point) => toNumber(point.high));
  const volumes = points.map((point) => toNumber(point.volume));
  const minimumPrice = Math.min(...lows);
  const maximumPrice = Math.max(...highs);
  const maximumVolume = Math.max(...volumes, 1);
  const priceRange = Math.max(maximumPrice - minimumPrice, 0.01);
  const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const slotWidth = plotWidth / points.length;
  const bodyWidth = Math.max(3, Math.min(14, slotWidth * 0.48));
  const priceY = (price: number) =>
    PRICE_TOP + ((maximumPrice - price) / priceRange) * PRICE_HEIGHT;

  return (
    <figure className="price-chart">
      <div className="chart-heading">
        <div>
          <p className="card-kicker">近 20 日</p>
          <h2>日 K 走势</h2>
        </div>
        <span>只读 · 1d</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="d0-chart-title d0-chart-description"
      >
        <title id="d0-chart-title">{`${instrumentName} 20 个日 K 点`}</title>
        <desc id="d0-chart-description">
          固定样本数据的开盘、最高、最低、收盘与成交量图。上涨为红色，下跌为绿色。
        </desc>
        {[0, 1, 2, 3].map((index) => {
          const y = PRICE_TOP + (PRICE_HEIGHT / 3) * index;
          return (
            <line
              className="chart-grid-line"
              x1={PLOT_LEFT}
              x2={CHART_WIDTH - PLOT_RIGHT}
              y1={y}
              y2={y}
              key={index}
            />
          );
        })}
        <text className="chart-axis-label" x="2" y={PRICE_TOP + 4}>
          {maximumPrice.toFixed(2)}
        </text>
        <text className="chart-axis-label" x="2" y={PRICE_TOP + PRICE_HEIGHT}>
          {minimumPrice.toFixed(2)}
        </text>
        {points.map((point, index) => {
          const x = PLOT_LEFT + slotWidth * index + slotWidth / 2;
          const openY = priceY(toNumber(point.open));
          const closeY = priceY(toNumber(point.close));
          const highY = priceY(toNumber(point.high));
          const lowY = priceY(toNumber(point.low));
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));
          const isUp = toNumber(point.close) >= toNumber(point.open);
          const volumeHeight =
            (toNumber(point.volume) / maximumVolume) * VOLUME_HEIGHT;
          const directionClass = isUp ? "chart-up" : "chart-down";

          return (
            <g data-bar-index={index} key={point.at}>
              <title>
                {`${point.at.slice(0, 10)} 开 ${point.open} 高 ${point.high} 低 ${point.low} 收 ${point.close} 量 ${point.volume}`}
              </title>
              <line
                className={directionClass}
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
              />
              <rect
                className={directionClass}
                x={x - bodyWidth / 2}
                y={bodyY}
                width={bodyWidth}
                height={bodyHeight}
              />
              <rect
                className={`${directionClass} chart-volume`}
                x={x - bodyWidth / 2}
                y={VOLUME_TOP + VOLUME_HEIGHT - volumeHeight}
                width={bodyWidth}
                height={volumeHeight}
              />
            </g>
          );
        })}
        <text className="chart-axis-label" x={PLOT_LEFT} y="238">
          成交量
        </text>
        <text className="chart-axis-label" x={PLOT_LEFT} y="314">
          {points[0]?.at.slice(0, 10)}
        </text>
        <text
          className="chart-axis-label chart-axis-end"
          x={CHART_WIDTH - PLOT_RIGHT}
          y="314"
        >
          {points.at(-1)?.at.slice(0, 10)}
        </text>
      </svg>
      <figcaption>
        <span>{points.length} 个日 K 点</span>
        <span>成交量使用同一样本 · 非实时</span>
      </figcaption>
    </figure>
  );
}
