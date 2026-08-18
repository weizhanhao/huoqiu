import styles from "../real-finance/instrument-section.module.css";
import type { Fund } from "../../server/fund.server";

/*
 * 真实基金详情。
 *
 * 数据来自两个免费公开接口：基金概况与净值历史，两边交叉对得上
 * （概况的单位净值与净值历史首行一致）。
 *
 * 刻意不做「立即购买」「定投」这类按钮：这个产品没有基金销售牌照，
 * 摆一个买入入口就是在假装能做一件它做不了的事。要买的人应该去持牌渠道，
 * 页面底部把这一点说清楚。
 */

const WAN = 10_000;
const YI = 100_000_000;

const formatScale = (value: number | null): string => {
  if (value === null) return "—";
  if (Math.abs(value) >= YI) return `${(value / YI).toFixed(2)} 亿元`;
  return `${(value / WAN).toFixed(2)} 万元`;
};

const formatNav = (value: number | null): string =>
  value === null ? "—" : value.toFixed(4);

/*
 * 收益率带正负号——涨了多少、跌了多少，符号是信息的一部分。
 */
const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

/*
 * 费率不带正号。
 *
 * 申购费率 1.5% 是要付出去的钱，显示成「+1.50%」读起来像赚了 1.5%——
 * 同一个百分号，两件相反的事。
 */
const formatRate = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(2)}%`;

const orDash = (value: string | null): string =>
  value === null || value.length === 0 ? "—" : value;

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

export function RealFundDetail({ fund }: Readonly<{ fund: Fund }>) {
  const facts: readonly Readonly<{ label: string; value: string }>[] = [
    { label: "基金代码", value: fund.code },
    { label: "基金类型", value: orDash(fund.kind) },
    { label: "基金公司", value: orDash(fund.manager) },
    { label: "成立日期", value: orDash(fund.startedOn) },
    { label: "最新规模", value: formatScale(fund.scale) },
    { label: "申购费率", value: formatRate(fund.applyRate) },
    { label: "近三月", value: formatPercent(fund.changeMonth3) },
    { label: "今年以来", value: formatPercent(fund.changeYear) },
  ];

  return (
    <div className={styles.content}>
      <h1 className={styles.heading}>
        {orDash(fund.name)}
        <small>{fund.code}</small>
      </h1>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          最新净值
          {fund.netValueOn === null ? null : (
            <span className={styles.count}>截至 {fund.netValueOn}</span>
          )}
        </h2>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>单位净值</dt>
            <dd>{formatNav(fund.netValue)}</dd>
          </div>
          <div className={styles.fact}>
            <dt>日涨跌幅</dt>
            <dd className={toneClass(fund.changePercent)}>
              {formatPercent(fund.changePercent)}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>基金概况</h2>
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div className={styles.fact} key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          历史净值
          <span className={styles.count}>
            {fund.navHistory.length.toString()} 个交易日
          </span>
        </h2>
        {fund.navHistory.length === 0 ? (
          /*
           * 净值历史单独一路取数，它挂了不等于这只基金没了。
           * 说清楚是取不到，而不是「这只基金没有净值」。
           */
          <p className={styles.prose}>
            历史净值暂时取不到，稍后再试。上方概况数据仍来自基金披露。
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">日期</th>
                  <th className={styles.numeric} scope="col">
                    单位净值
                  </th>
                  <th className={styles.numeric} scope="col">
                    累计净值
                  </th>
                  <th className={styles.numeric} scope="col">
                    日增长率
                  </th>
                  <th scope="col">申购状态</th>
                  <th scope="col">赎回状态</th>
                </tr>
              </thead>
              <tbody>
                {fund.navHistory.map((entry, index) => (
                  <tr key={`${entry.date ?? ""}-${index.toString()}`}>
                    <th scope="row">{orDash(entry.date)}</th>
                    <td className={styles.numeric}>
                      {formatNav(entry.netValue)}
                    </td>
                    <td className={styles.numeric}>
                      {formatNav(entry.accumulated)}
                    </td>
                    <td
                      className={`${styles.numeric} ${toneClass(entry.changePercent)}`}
                    >
                      {formatPercent(entry.changePercent)}
                    </td>
                    <td>{orDash(entry.purchaseState)}</td>
                    <td>{orDash(entry.redeemState)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
        这段说明必须留着。
        本站没有基金销售牌照，所以没有申购、定投、赎回入口——
        页面上摆一个买入按钮，是在假装能做一件它做不了的事。
      */}
      <p className={styles.disclosure}>
        本站不提供基金申购、定投或赎回功能。
      </p>
    </div>
  );
}
