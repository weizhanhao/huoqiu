import styles from "./instrument-section.module.css";
import type { ResearchReports } from "../../server/company-ops.server";
import type { FinancialStatement } from "../../server/financials.server";

/*
 * 研究分析：研究报告与杜邦分析。
 *
 * 研报里的评级和目标价是**某家券商的观点**，不是事实，所以每条都带机构名
 * 和发布日期，并链到正文——读者要能自己核对。
 *
 * 杜邦分析里的权益乘数是**推导值**，不是上市公司报出来的数。页面上必须
 * 标出来：把推导值和披露值混在一起显示，读者会以为都是原始披露。
 */

const orDash = (value: string | null | undefined): string =>
  value === null || value === undefined || value.length === 0 ? "—" : value;

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(2)}%`;

const formatTimes = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(2)} 次`;

export function ResearchReportsSection({
  research,
}: Readonly<{ research: ResearchReports }>) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        研究报告
        <span className={styles.count}>
          {research.reports.length.toString()} 篇
        </span>
      </h2>
      {research.reports.length === 0 ? (
        /*
         * 小盘股常年没有券商覆盖。这句话说的是「确实没有人写」，
         * 不是「我们没查到」。
         */
        <p className={styles.prose}>
          公开数据源中没有检索到这只标的的券商研究报告。
        </p>
      ) : (
        <ul className={styles.noticeList}>
          {research.reports.map((report) => (
            <li className={styles.notice} key={report.href}>
              <a
                className={styles.noticeTitle}
                href={report.href}
                rel="noreferrer"
                target="_blank"
              >
                {orDash(report.title)}
              </a>
              <span className={styles.noticeMeta}>
                {orDash(report.institution)} · {orDash(report.publishedOn)}
                {report.rating === null ? null : ` · 评级 ${report.rating}`}
                {report.targetPrice === null
                  ? null
                  : ` · 目标价 ${report.targetPrice.toFixed(2)} 元`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {research.reports.length === 0 ? null : (
        <p className={styles.disclosure}>
          评级与目标价是各家券商各自的观点，不代表本站判断。
        </p>
      )}
    </section>
  );
}

/** 从「主要指标」里按行名取一行；找不到返回空数组。 */
const lineValues = (
  statement: FinancialStatement,
  label: string,
): readonly (number | null)[] =>
  statement.sections
    .flatMap((section) => section.lines)
    .find((line) => line.label === label)?.values ?? [];

/*
 * 权益乘数 = 1 ÷ (1 − 资产负债率)。
 *
 * 这是一个恒等式，不是估计——但输入是期末资产负债率，所以结果是期末口径。
 */
const equityMultiplier = (debtRatioPercent: number | null): number | null => {
  if (debtRatioPercent === null) return null;
  const remaining = 1 - debtRatioPercent / 100;
  return remaining <= 0 ? null : 1 / remaining;
};

type DupontRow = Readonly<{
  derived?: boolean;
  format: (value: number | null) => string;
  label: string;
  values: readonly (number | null)[];
}>;

export function DupontSection({
  metrics,
}: Readonly<{ metrics: FinancialStatement }>) {
  const debtRatio = lineValues(metrics, "资产负债率");

  const rows: readonly DupontRow[] = [
    {
      format: formatPercent,
      label: "净资产收益率（加权）",
      values: lineValues(metrics, "净资产收益率（加权）"),
    },
    {
      format: formatPercent,
      label: "销售净利率",
      values: lineValues(metrics, "销售净利率"),
    },
    {
      format: formatTimes,
      label: "总资产周转率",
      values: lineValues(metrics, "总资产周转率"),
    },
    { format: formatPercent, label: "资产负债率", values: debtRatio },
    {
      derived: true,
      format: formatTimes,
      label: "权益乘数",
      values: debtRatio.map(equityMultiplier),
    },
  ];

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>杜邦分析</h2>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">项目</th>
              {metrics.periods.map((period, index) => (
                <th
                  className={styles.numeric}
                  key={`${period.endedOn ?? ""}-${index.toString()}`}
                  scope="col"
                >
                  {period.label ?? period.endedOn ?? "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.derived === true ? (
                    <span className={styles.count}>推导</span>
                  ) : null}
                </th>
                {metrics.periods.map((_, index) => (
                  <td
                    className={styles.numeric}
                    key={`${row.label}-${index.toString()}`}
                  >
                    {row.format(row.values[index] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/*
        这段说明必须留着。
        杜邦恒等式 ROE = 净利率 × 周转率 × 权益乘数 用的是平均资产口径，
        而上面的净资产收益率是加权口径、周转率与负债率是期末口径——
        三者相乘不会精确等于那一行 ROE。不说明的话，读者会以为是我们算错了，
        或者更糟：以为乘出来的那个数也是公司披露的。
      */}
      <p className={styles.disclosure}>
        净资产收益率、销售净利率、总资产周转率、资产负债率四项均为公开披露值；
        权益乘数由资产负债率按 1 ÷ (1 − 资产负债率)
        推导得出。杜邦恒等式采用平均资产口径，而披露的净资产收益率为加权口径，
        因此三项相乘与该行数值不会完全相等。
      </p>
    </section>
  );
}
