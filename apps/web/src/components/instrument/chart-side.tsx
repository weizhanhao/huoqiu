"use client";

import { useLiveInstrument } from "../../features/real-finance/live-instrument";
import styles from "./chart-side.module.css";
import type { InstrumentQuote } from "../../server/market-quote.server";
import type { Tick, TickTape } from "../../server/tick-details.server";

/*
 * 图右侧那一列：五档盘口 + 成交明细。
 *
 * 盘口原先在报价头里、图在下面，两块隔着一整片指标。看盘的人要同时看图和
 * 盘口——雪球把它们并排放，是因为这两样本来就是一起看的。
 *
 * 每一块都得有真数据才出现：指数没有盘口，港美股的免费接口也不给；
 * 成交明细只有东财有，取不到就不给这一块。摆一张全是「—」的表比不摆更糟，
 * 它看着像加载失败，而实际上是这种标的本来就没有。
 */

const WAN = 10_000;

/** 一手 100 股。盘口给的是股，看盘习惯按手。 */
const SHARES_PER_HAND = 100;

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

/*
 * 成交量按股显示，上万折成「万」。
 *
 * 和指标区那一片同口径——同一页上两个成交量用两种单位，读的人只会
 * 以为其中一个错了。
 */
const formatShares = (value: number): string =>
  value >= WAN
    ? `${(value / WAN).toFixed(2)}万`
    : Math.round(value).toLocaleString("zh-CN");

const toneOf = (price: number, base: number | null): string | undefined => {
  if (base === null || price === base) return undefined;
  return price > base ? styles.up : styles.down;
};

function OrderBookRows({
  base,
  levels,
  prefix,
  reversed,
}: Readonly<{
  /** 昨收。挂单价相对它的方向，是这张表最先被读的一层。 */
  base: number | null;
  levels: readonly Readonly<{
    price: number | null;
    volume: number | null;
  }>[];
  prefix: string;
  /** 卖盘从卖五排到卖一，贴着现价——这是看盘的习惯顺序。 */
  reversed: boolean;
}>) {
  const rows = reversed ? [...levels].reverse() : [...levels];
  return (
    <>
      {rows.map((level, index) => {
        const rank = reversed ? levels.length - index : index + 1;
        return (
          <tr key={`${prefix}-${String(rank)}`}>
            <th scope="row">
              {prefix}
              {rank}
            </th>
            {/* 挂单价按昨收着色：一眼看出这一档在昨收上方还是下方。 */}
            <td
              className={`${styles.numeric} ${
                level.price === null ? "" : (toneOf(level.price, base) ?? "")
              }`}
            >
              {formatPrice(level.price)}
            </td>
            <td className={styles.numeric}>
              {level.volume === null
                ? "—"
                : Math.round(level.volume / SHARES_PER_HAND).toLocaleString(
                    "zh-CN",
                  )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function TickRow({ base, tick }: Readonly<{ base: number | null; tick: Tick }>) {
  const sideClass =
    tick.side === "buy"
      ? styles.up
      : tick.side === "sell"
        ? styles.down
        : undefined;
  return (
    <tr>
      <td className={styles.tickTime}>{tick.time}</td>
      <td className={`${styles.numeric} ${toneOf(tick.price, base) ?? ""}`}>
        {tick.price.toFixed(2)}
      </td>
      <td className={`${styles.numeric} ${sideClass ?? ""}`}>
        {formatShares(tick.volumeShares)}
      </td>
    </tr>
  );
}

export function ChartSide({
  quote: initialQuote,
  tape: initialTape,
}: Readonly<{
  /** 有五档才给盘口；指数与港美股拿不到，那一块整个不出现。 */
  quote: InstrumentQuote | null;
  tape: TickTape | null;
}>) {
  /*
   * 盘口和逐笔是看实盘的人盯得最紧的两块——十档挂单每秒都在变。
   * 这两块和上面的价格、指标同出一次请求，屏上不会出现「盘口是 14:35 的、
   * 委比是 14:36 的」这种各自都对、凑起来错的组合。
   */
  const live = useLiveInstrument();
  const quote = live?.quote ?? initialQuote;
  const tape = live?.tape ?? initialTape;
  const hasBook =
    quote !== null && (quote.asks.length > 0 || quote.bids.length > 0);
  if (!hasBook && tape === null) return null;

  return (
    <div className={styles.side}>
      {hasBook ? (
        <section className={styles.block}>
          <h3 className={styles.heading}>五档盘口</h3>
          <table className={styles.table}>
            <tbody>
              {/* 卖盘在上、买盘在下，卖五到卖一自上而下贴近现价。 */}
              <OrderBookRows
                base={tape?.previousClose ?? quote.prevClose}
                levels={quote.asks}
                prefix="卖"
                reversed
              />
              <OrderBookRows
                base={tape?.previousClose ?? quote.prevClose}
                levels={quote.bids}
                prefix="买"
                reversed={false}
              />
            </tbody>
          </table>
        </section>
      ) : null}

      {tape === null ? null : (
        <section className={styles.block}>
          <h3 className={styles.heading}>成交明细</h3>
          <table className={styles.table}>
            <tbody>
              {tape.ticks.map((tick) => (
                <TickRow
                  base={tape.previousClose}
                  key={`${tick.time}-${String(tick.price)}-${String(
                    tick.volumeShares,
                  )}`}
                  tick={tick}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
