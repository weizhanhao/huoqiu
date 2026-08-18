import { InstrumentDiscussionComposer } from "../market-portfolio/instrument-discussion-composer";
import { InstrumentDiscussionList } from "../market-portfolio/instrument-discussion-list";
import { ChartPanel } from "../../components/instrument/chart-panel";
import type { KlineSeries } from "./kline.server";
import { QuoteMetricsGrid } from "../../components/instrument/quote-metrics-grid";
import { LiveInstrumentProvider } from "./live-instrument";
import { RealQuoteHeader } from "./real-quote-header";
import type { QuoteMetrics } from "../../server/quote-metrics.server";
import type {
  ChartPeriod,
  ChartSeries,
} from "../../server/chart-series.server";
import type { TickTape } from "../../server/tick-details.server";
import type { InstrumentQuote } from "../../server/market-quote.server";
import styles from "./real-instrument-detail.module.css";

/*
 * 真实标的详情。
 *
 * 站内 35 个标的是虚构公司，它们的图只能是合成的——那条路由的图表组件
 * 自己在 <desc> 里写明了这一点。而真实快照里的 8 个标的（5 个指数、
 * 3 只个股）此前只在 /markets 页排成一列，点不进去，也就没有「这只标的
 * 自己的页面」。
 *
 * 这里的每个数字都从那 180 根真实日线直接算出，不引入任何估计值：区间高低
 * 取 high/low 的极值，涨跌天数按相邻收盘价比较，日均成交量是算术平均。
 * 算不出来的就不显示，而不是填一个看起来合理的数。
 */

const formatPrice = (value: number): string =>
  new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);

const formatVolume = (value: number): string =>
  value >= 100_000_000
    ? `${formatPrice(value / 100_000_000)} 亿`
    : `${formatPrice(value / 10_000)} 万`;

type RangeStats = Readonly<{
  amplitudePct: number;
  averageVolume: number;
  downDays: number;
  firstDate: string;
  highest: number;
  lastDate: string;
  lowest: number;
  upDays: number;
}>;

/** 统计量只依赖真实 bars；不足两根时返回 null，由调用方决定不渲染这一段。 */
const summarize = (bars: KlineSeries["bars"]): RangeStats | null => {
  const first = bars[0];
  const last = bars.at(-1);
  if (first === undefined || last === undefined || bars.length < 2) {
    return null;
  }

  const highest = Math.max(...bars.map((bar) => bar.high));
  const lowest = Math.min(...bars.map((bar) => bar.low));
  let upDays = 0;
  let downDays = 0;
  for (const [index, bar] of bars.entries()) {
    const previous = bars[index - 1];
    if (previous === undefined) continue;
    if (bar.close > previous.close) upDays += 1;
    if (bar.close < previous.close) downDays += 1;
  }

  return {
    amplitudePct: ((highest - lowest) / lowest) * 100,
    averageVolume:
      bars.reduce((total, bar) => total + bar.volume, 0) / bars.length,
    downDays,
    firstDate: first.date,
    highest,
    lastDate: last.date,
    lowest,
    upDays,
  };
};

export function RealInstrumentDetail({
  chartSeries,
  fetchedAt,
  metrics = null,
  period,
  tape = null,
  quote = null,
  series,
}: Readonly<{
  fetchedAt: string;
  /*
   * 那一片行情指标（涨跌停、换手、振幅、市盈率、股本……）。
   * 取不到就整片不渲染，而不是摆二十多个「—」——一整片破折号看着像
   * 这只股票今天没交易，实际上是没问到。
   */
  metrics?: QuoteMetrics | null;
  /* 当前周期与它的数据。取不到时图表区自己说取不到。 */
  period: ChartPeriod;
  chartSeries: ChartSeries | null;
  /* 图右侧那一列的成交明细。取不到就少这一块。 */
  tape?: TickTape | null;
  /*
   * 实时报价与五档盘口。
   *
   * 可选：预生成快照那条分支只有日线，没有盘口——那时不渲染报价头，
   * 而不是拿最后一根日线的收盘价冒充「现价」。
   */
  quote?: InstrumentQuote | null;
  series: KlineSeries;
}>) {
  const stats = summarize(series.bars);

  return (
    <LiveInstrumentProvider symbol={series.symbol}>
      <div className={styles.page}>
        {quote === null ? null : <RealQuoteHeader quote={quote} />}
        {metrics === null ? null : <QuoteMetricsGrid metrics={metrics} />}
        <ChartPanel
          period={period}
          quote={quote}
          series={chartSeries}
          symbol={series.symbol}
          tape={tape}
        />

        {stats === null ? null : (
          <section
            className={styles.card}
            aria-labelledby="range-stats-heading"
          >
            <h2 id="range-stats-heading">
              区间统计
              <small>
                {stats.firstDate} 至 {stats.lastDate} · {series.bars.length}{" "}
                个交易日
              </small>
            </h2>
            <dl className={styles.stats}>
              <div>
                <dt>区间最高</dt>
                <dd>{formatPrice(stats.highest)}</dd>
              </div>
              <div>
                <dt>区间最低</dt>
                <dd>{formatPrice(stats.lowest)}</dd>
              </div>
              <div>
                <dt>区间振幅</dt>
                <dd>{formatPrice(stats.amplitudePct)}%</dd>
              </div>
              <div>
                <dt>上涨 / 下跌交易日</dt>
                <dd>
                  {stats.upDays} / {stats.downDays}
                </dd>
              </div>
              <div>
                <dt>日均成交量</dt>
                <dd>{formatVolume(stats.averageVolume)}</dd>
              </div>
            </dl>
            {/*
            这段说明必须留着：数据是真的，但它是抓取时点的日线快照，不是实时
            行情，也不构成投资建议。社区内容已经是真人真账号了，行情不是，
            这个区别不该靠含糊措辞抹平。
          */}
            <p className={styles.disclosure}>
              以上数字均由腾讯财经公开行情接口的日线数据直接计算得出。数据抓取于{" "}
              {fetchedAt.slice(0, 10)}
              ，为日线快照而非实时行情，不提供投资建议或交易能力。
            </p>
          </section>
        )}

        <section className={styles.card} aria-labelledby="discussion-heading">
          <h2 id="discussion-heading">讨论</h2>
          <InstrumentDiscussionComposer
            name={series.name}
            nextPath={`/instruments/${series.symbol}`}
            symbol={series.symbol}
          />
          {/*
          发帖框下面要能看见已经说过的话。此前这里只有一个输入框：
          发出去的内容在这一页上再也看不到，别人说了什么更无从得知。
        */}
          <InstrumentDiscussionList symbol={series.symbol} />
        </section>
      </div>
    </LiveInstrumentProvider>
  );
}
