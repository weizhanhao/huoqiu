import styles from "./instrument-detail.module.css";
import type { InstrumentChartSeries } from "./instrument-detail-data";

type InstrumentDetailChartProperties = Readonly<{
  changePct: number;
  instrumentName: string;
  price: number;
  series: InstrumentChartSeries;
}>;

const plotPoint = (
  value: number,
  index: number,
  length: number,
  minimum: number,
  spread: number,
) => {
  const x = 8 + (index * 84) / Math.max(length - 1, 1);
  const y = 9 + ((minimum + spread - value) / spread) * 54;
  return { x, y };
};

export function InstrumentDetailChart({
  changePct,
  instrumentName,
  price,
  series,
}: InstrumentDetailChartProperties) {
  const templateLastChange = series.values.at(-1) ?? 0;
  const lastIndex = Math.max(series.values.length - 1, 1);
  const displayValues = series.values.map(
    (value, index) =>
      value + ((changePct - templateLastChange) * index) / lastIndex,
  );
  const lastChange = displayValues.at(-1) ?? changePct;
  const prices = displayValues.map(
    (changePercent) =>
      (price / (1 + lastChange / 100)) * (1 + changePercent / 100),
  );
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const spread = Math.max(maximum - minimum, price * 0.01);
  const points = prices
    .map((value, index) => {
      const point = plotPoint(value, index, prices.length, minimum, spread);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
  const volumeMaximum = Math.max(...series.volumes);
  const isKLine = ["daily", "weekly", "monthly"].includes(series.id);
  const summaryLabel = series.label.endsWith("K")
    ? `${series.label} 走势`
    : `${series.label}走势`;
  const summary = `${summaryLabel}：${displayValues.length} 个固定样本采样点`;
  const isUp = changePct >= 0;

  return (
    <figure className={styles.chartFigure}>
      <div className={styles.chartMeta}>
        <div>
          <strong>{series.label}走势</strong>
          <span>固定样本序列 · 非实时</span>
        </div>
        <span className={isUp ? styles.up : styles.down}>
          区间末值 {lastChange >= 0 ? "+" : ""}
          {lastChange.toFixed(2)}%
        </span>
      </div>
      <svg
        aria-label={`${instrumentName}${summary}；下方为成交量柱状图`}
        className={styles.priceChart}
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <title>{`${instrumentName} ${summary}，成交量柱状图`}</title>
        <desc>
          价格区间 {minimum.toFixed(2)} 至 {maximum.toFixed(2)}
          ，所有点均为离线合成数据。
        </desc>
        <g aria-hidden="true" className={styles.chartGrid}>
          <line x1="8" x2="92" y1="9" y2="9" />
          <line x1="8" x2="92" y1="36" y2="36" />
          <line x1="8" x2="92" y1="63" y2="63" />
        </g>
        {isKLine ? (
          <g aria-hidden="true" className={styles.candles}>
            {prices.map((value, index) => {
              const current = plotPoint(
                value,
                index,
                prices.length,
                minimum,
                spread,
              );
              const previousValue = prices[Math.max(index - 1, 0)] ?? value;
              const previous = plotPoint(
                previousValue,
                index,
                prices.length,
                minimum,
                spread,
              );
              const rising = value >= previousValue;
              return (
                <g
                  className={rising ? styles.candleUp : styles.candleDown}
                  key={`${series.id}-${index}`}
                >
                  <line
                    x1={current.x}
                    x2={current.x}
                    y1={Math.min(current.y, previous.y) - 2}
                    y2={Math.max(current.y, previous.y) + 2}
                  />
                  <rect
                    height={Math.max(Math.abs(previous.y - current.y), 1.8)}
                    width="2.7"
                    x={current.x - 1.35}
                    y={Math.min(current.y, previous.y)}
                  />
                </g>
              );
            })}
          </g>
        ) : null}
        <polyline
          aria-hidden="true"
          className={isUp ? styles.chartLineUp : styles.chartLineDown}
          points={points}
        />
        <g aria-label="成交量柱状图" className={styles.volumeBars}>
          <title>成交量柱状图</title>
          {series.volumes.map((volume, index) => {
            const height = (volume / volumeMaximum) * 22;
            const x = 8 + (index * 84) / Math.max(series.volumes.length - 1, 1);
            return (
              <rect
                aria-hidden="true"
                height={height}
                key={`${series.id}-volume-${index}`}
                width="2.3"
                x={x - 1.15}
                y={96 - height}
              />
            );
          })}
        </g>
      </svg>
      <figcaption aria-live="polite">{summary}</figcaption>
    </figure>
  );
}
