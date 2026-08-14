"use client";

import { useLiveInstrument } from "../../features/real-finance/live-instrument";
import styles from "./quote-metrics-grid.module.css";
import type { QuoteMetrics } from "../../server/quote-metrics.server";

/*
 * 行情页那一片指标。
 *
 * 个股页此前只有六个数字（今开/昨收/最高/最低/成交量/成交额），对着雪球
 * 那一片三十多格显得很空。数据一直都在，只是没取。
 *
 * 有几格这里**没有**：股息(TTM)、股息率(TTM)、表决权、注册制、盈利情况、
 * 盘后量/额。上游那个报价接口里找不到能对上的字段，我不拿相近的顶上——
 * 一个错的股息率比没有股息率糟得多。所以这一片是流式排布，而不是硬排成
 * 四列八行再留一串空洞。
 */

const WAN = 10_000;
const YI = 100_000_000;
const WAN_YI = 1_000_000_000_000;

const dash = "—";

/*
 * 保留两位，逢五进一。
 *
 * 不能直接用 toFixed：它舍向哪边取决于这个数在二进制里落在哪，
 * (3.675).toFixed(2) 得到的是 3.67 而不是 3.68——同一片指标里，有的数
 * 进位有的不进，而每个单看都挑不出错。
 */
const round2 = (value: number): string => {
  const scaledUp = Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
  return `${value < 0 ? "-" : ""}${scaledUp.toFixed(2)}`;
};

const price = (value: number | null): string =>
  value === null ? dash : round2(value);

const percent = (value: number | null): string =>
  value === null ? dash : `${round2(value)}%`;

/*
 * 大数按中文习惯断到万/亿/万亿。
 *
 * 一长串零没人读得出量级——3675000000000 和 367500000000 扫一眼分不出
 * 差了十倍。
 */
const scaled = (value: number | null): string => {
  if (value === null) return dash;
  const magnitude = Math.abs(value);
  if (magnitude >= WAN_YI) return `${round2(value / WAN_YI)}万亿`;
  if (magnitude >= YI) return `${round2(value / YI)}亿`;
  if (magnitude >= WAN) return `${round2(value / WAN)}万`;
  return round2(value);
};

/** 货币不是猜的，是上市地决定的。 */
const currencyOf = (symbol: string): string => {
  if (symbol.startsWith("hk")) return "HKD";
  if (symbol.startsWith("us")) return "USD";
  return "CNY";
};

/*
 * 哪些数字有方向，哪些没有。
 *
 * 这一片三十来个数，全上色会花得没法看，全不上色又等于放弃了最容易读的
 * 那一层信息。分界线是「这个数相对昨收有没有方向」：
 *   最高/最低/今开 —— 有，跟昨收比
 *   涨停/跌停       —— 有，天然一红一绿
 *   委比/量比       —— 有，正负与强弱
 *   昨收本身、换手、振幅、市盈率、股本、市值 —— 没有方向，一律中性
 *
 * 换手 8% 涂成红色是没有意义的：它不表示涨，只表示换手高。给一个没有
 * 方向的数字加上方向，比不上色更误导。
 */
type Tone = "down" | "flat" | "up";

const against = (value: number | null, base: number | null): Tone => {
  if (value === null || base === null || value === base) return "flat";
  return value > base ? "up" : "down";
};

const bySign = (value: number | null): Tone => {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
};

export function QuoteMetricsGrid({
  metrics: initialMetrics,
}: Readonly<{ metrics: QuoteMetrics }>) {
  /*
   * 成交量、成交额、换手、振幅、委比、量比在盘中一直在变，跟价格同频。
   * 停在打开页面那一刻，这一片就会和上面跳动的价格互相矛盾。
   */
  const metrics = useLiveInstrument()?.metrics ?? initialMetrics;
  /*
   * 顺序照看盘的习惯走：先是当日的价（高低开收、涨跌停），再是活跃度
   * （量、额、换手、振幅），最后才是估值与股本这些不随分钟变的。
   */
  const base = metrics.previousClose;
  const cells: readonly Readonly<{
    label: string;
    tone: Tone;
    value: string;
  }>[] = [
    {
      label: "最高",
      tone: against(metrics.high, base),
      value: price(metrics.high),
    },
    {
      label: "今开",
      tone: against(metrics.open, base),
      value: price(metrics.open),
    },
    { label: "涨停", tone: "up", value: price(metrics.limitUp) },
    { label: "成交量", tone: "flat", value: scaled(metrics.volumeShares) },
    {
      label: "最低",
      tone: against(metrics.low, base),
      value: price(metrics.low),
    },
    { label: "昨收", tone: "flat", value: price(metrics.previousClose) },
    { label: "跌停", tone: "down", value: price(metrics.limitDown) },
    { label: "成交额", tone: "flat", value: scaled(metrics.amount) },
    { label: "换手", tone: "flat", value: percent(metrics.turnoverPercent) },
    /* 量比大于 1 是放量，小于 1 是缩量——这是它的方向。 */
    {
      label: "量比",
      tone: bySign(
        metrics.volumeRatio === null ? null : metrics.volumeRatio - 1,
      ),
      value: price(metrics.volumeRatio),
    },
    { label: "振幅", tone: "flat", value: percent(metrics.amplitudePercent) },
    {
      label: "委比",
      tone: bySign(metrics.orderRatioPercent),
      value: percent(metrics.orderRatioPercent),
    },
    { label: "总市值", tone: "flat", value: scaled(metrics.totalMarketCap) },
    { label: "流通值", tone: "flat", value: scaled(metrics.floatMarketCap) },
    { label: "市盈率(动)", tone: "flat", value: price(metrics.peDynamic) },
    { label: "市盈率(TTM)", tone: "flat", value: price(metrics.peTtm) },
    { label: "市盈率(静)", tone: "flat", value: price(metrics.peStatic) },
    { label: "市净率", tone: "flat", value: price(metrics.priceToBook) },
    { label: "每股收益", tone: "flat", value: price(metrics.earningsPerShare) },
    {
      label: "每股净资产",
      tone: "flat",
      value: price(metrics.bookValuePerShare),
    },
    { label: "52周最高", tone: "flat", value: price(metrics.week52High) },
    { label: "52周最低", tone: "flat", value: price(metrics.week52Low) },
    { label: "总股本", tone: "flat", value: scaled(metrics.totalShares) },
    { label: "流通股", tone: "flat", value: scaled(metrics.floatShares) },
    { label: "货币单位", tone: "flat", value: currencyOf(metrics.symbol) },
  ];

  return (
    <dl aria-label="行情指标" className={styles.grid}>
      {cells.map((cell) => (
        <div className={styles.cell} key={cell.label}>
          {/* 标签与数值紧挨着，冒号连起来——中间拉开一道空档，
              眼睛得横跨整格才能把它们配成一对。 */}
          <dt className={styles.label}>{cell.label}</dt>
          <dd className={`${styles.value} ${styles[cell.tone] ?? ""}`}>
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
