"use client";

import { useLiveInstrument } from "./live-instrument";
import styles from "./real-quote-header.module.css";
import type { InstrumentQuote } from "../../server/market-quote.server";

/*
 * 报价头与五档盘口。
 *
 * 涨跌幅在这里现算：(现价 − 昨收) ÷ 昨收。上游那个报价串本身不给涨跌幅，
 * 与其另开一路请求，不如用同一份数据算——两个数字必然自洽。
 *
 * 盘口里价为 null 的那一档表示没有挂单（停牌，或档位不足）。
 * 显示成「0.00」会让人以为有人在零价挂单，所以显示「—」。
 */

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatChange = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

const tone = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return (value > 0 ? styles.up : styles.down) ?? "";
};

export function RealQuoteHeader({
  quote: initialQuote,
}: Readonly<{
  quote: InstrumentQuote;
}>) {
  /*
   * 价来自统一的实时层；没有那层包裹时（测试里单独渲染）就用服务端
   * 渲染的这一份。价和时间戳必然同源——换了价不换时间，等于宣称一个
   * 旧时刻有个新价格。
   */
  const quote = useLiveInstrument()?.quote ?? initialQuote;

  /*
   * 涨跌由现价与昨收算出。昨收为 0 时不算——除以零得到的不是「涨停」，
   * 是一个没有意义的数字。
   */
  const change = quote.prevClose > 0 ? quote.last - quote.prevClose : null;
  const changePercent =
    quote.prevClose > 0
      ? ((quote.last - quote.prevClose) / quote.prevClose) * 100
      : null;

  /*
   * 这里原本还有一排六格（今开/昨收/最高/最低/成交量/成交额）。
   *
   * 那六格现在由 QuoteMetricsGrid 一并给出，而且量纲更准（成交量按股，
   * 和换手率、流通股对得上）。两处都留着，同一页会出现两个成交量、
   * 两种单位——一个写「257.25 万手」，一个写「2.57 亿」，读的人只会
   * 以为其中一个错了。
   */
  return (
    <section className={styles.header} aria-label="实时报价">
      <div className={styles.priceRow}>
        {/*
          名字与代码不在这里，在页面标题那一行（StockShell）。
          两处都写就是同一页出现两个 h1，靠标题导航的人会听到这只股票
          被念两遍，还分不清哪个才是这一页的主体。
        */}
        <p className={styles.tradedAt}>{quote.tradedAt.replace("T", " ")}</p>
        <div className={`${styles.price} ${tone(changePercent)}`}>
          <strong>{formatPrice(quote.last)}</strong>
          <span>{formatChange(change)}</span>
          <span>{formatPercent(changePercent)}</span>
        </div>
      </div>
    </section>
  );
}
