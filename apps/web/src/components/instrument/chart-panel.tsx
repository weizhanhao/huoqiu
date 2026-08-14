import Link from "next/link";

import { ChartSide } from "./chart-side";
import { IntradayChart } from "./intraday-chart";
import styles from "./chart-panel.module.css";
import { KlineChart } from "../../features/real-finance/kline-chart";
import type { InstrumentQuote } from "../../server/market-quote.server";
import type { TickTape } from "../../server/tick-details.server";
import {
  CHART_PERIODS,
  type ChartPeriod,
  type ChartSeries,
} from "../../server/chart-series.server";

/*
 * 图表区：上面一排周期，下面对应的图。
 *
 * 周期做成链接、状态放在地址里（?period=week），不是客户端页签：
 * 这样一个周期能直接分享出去，浏览器的前进后退也管用，而且不依赖 JS。
 * 站内其他地方（榜单、选股器）的筛选也都是这么存的。
 *
 * 分时与五日画折线（带均价线和昨收基准），其余周期画蜡烛。
 */

/*
 * 来源说明每个周期都要在。
 *
 * 这一行原本挂在日 K 图组件里，切到分时就没了——而分时恰好是默认视图，
 * 等于绝大多数人看到的那一屏没有来源标注。数据是真的，但它是公开接口的
 * 快照、不是实时行情，这个区别不该因为换了个周期就消失。
 */
const SOURCE_NOTE = "腾讯财经公开行情接口 · 非实时，不构成投资建议";

export function ChartPanel({
  period,
  quote,
  series,
  symbol,
  tape,
}: Readonly<{
  period: ChartPeriod;
  /** 五档盘口。指数与港美股拿不到，那一块整个不出现。 */
  quote: InstrumentQuote | null;
  /** 取不到就说取不到——画一张空图会让人以为这只股票停牌了。 */
  series: ChartSeries | null;
  symbol: string;
  tape: TickTape | null;
}>) {
  return (
    <section aria-labelledby="chart-heading" className={styles.panel}>
      <h2 className="visually-hidden" id="chart-heading">
        走势图
      </h2>

      <nav aria-label="图表周期" className={styles.tabs}>
        {CHART_PERIODS.map((entry) => (
          <Link
            aria-current={entry.id === period ? "page" : undefined}
            className={styles.tab}
            /* 供 CSS 用加粗副本预留宽度，避免选中态改变页签宽度。 */
            data-label={entry.label}
            href={`/instruments/${symbol}?period=${entry.id}`}
            key={entry.id}
            /* 切周期是同一页换内容，不该滚回顶部。 */
            scroll={false}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {/*
        图与盘口并排。看盘的人是同时看这两样的——盘口原先在报价头里、
        图在下面，中间还隔着一整片指标，等于逼人来回滚。
      */}
      <div className={styles.body}>
        <div className={styles.chartColumn}>
      {series === null ? (
        <p className="page-state-message">
          这个周期的行情暂时取不到，请稍后再试。
        </p>
      ) : series.kind === "line" ? (
        <IntradayChart
          market={
            symbol.startsWith("hk") ? "hk" : symbol.startsWith("us") ? "us" : "cn"
          }
          period={period}
          points={series.points}
          previousClose={series.previousClose}
          symbol={symbol}
        />
      ) : (
        <KlineChart
          bars={series.bars.map((bar) => ({
            close: bar.close,
            date: bar.date,
            high: bar.high,
            low: bar.low,
            open: bar.open,
            volume: bar.volumeShares,
          }))}
          market=""
          name=""
          periodLabel={
            CHART_PERIODS.find((entry) => entry.id === period)?.label ?? "日线"
          }
          refreshPeriod={period}
          sourceLabel={SOURCE_NOTE}
          symbol={symbol}
        />
      )}

      {/* 折线那条路径的图组件不带来源行，这里补上——两条路都要有。 */}
      {series?.kind === "line" ? (
        <p className={styles.source}>{SOURCE_NOTE}</p>
      ) : null}
        </div>

        <ChartSide quote={quote} tape={tape} />
      </div>
    </section>
  );
}
