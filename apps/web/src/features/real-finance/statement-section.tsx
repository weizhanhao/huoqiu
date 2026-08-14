import styles from "./instrument-section.module.css";
import type {
  EarningsForecast,
  FinancialStatement,
  LineUnit,
} from "../../server/financials.server";

/*
 * 财务报表：主要指标、利润表、资产负债表、现金流量表共用这一个组件。
 *
 * 单位跟着行走，不是整张表一个单位。金额按亿/万折算读起来才有量感，
 * 但每股收益、比率、周转天数各有各的量纲——整张表套一个单位会把
 * -0.05 元/股 折算成 -0.000005 万元。
 *
 * 上游没披露的格子是「—」，不是 0。报表上写「本期营业成本为零」是一句假话。
 */

const WAN = 10_000;
const YI = 100_000_000;

const formatYuan = (value: number): string => {
  const magnitude = Math.abs(value);
  if (magnitude >= YI) return `${(value / YI).toFixed(2)} 亿`;
  if (magnitude >= WAN) return `${(value / WAN).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
};

const formatCell = (value: number | null, unit: LineUnit): string => {
  if (value === null) return "—";
  if (unit === "yuan") return formatYuan(value);
  if (unit === "percent") return `${value.toFixed(2)}%`;
  if (unit === "days") return `${value.toFixed(1)} 天`;
  if (unit === "times") return value.toFixed(2);
  // perShare：每股口径小数位多给两位才看得出差别。
  return value.toFixed(4);
};

const unitNote = (unit: LineUnit): string => {
  if (unit === "yuan") return "元";
  if (unit === "perShare") return "元/股";
  return "";
};

/*
 * 业绩预告。
 *
 * 预告本身就是一个区间。压成一个数字（取中值、取一端）都是在替上市公司
 * 下一个它没下的结论，所以两端都显示。
 */
const range = (
  lower: number | null,
  upper: number | null,
  format: (value: number) => string,
): string => {
  if (lower === null && upper === null) return "—";
  if (lower === null || upper === null) {
    return format((lower ?? upper) as number);
  }
  return lower === upper
    ? format(lower)
    : `${format(lower)} ~ ${format(upper)}`;
};

export function ForecastSection({
  forecast,
}: Readonly<{ forecast: EarningsForecast }>) {
  if (forecast.entries.length === 0) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>业绩预告</h2>
        <p className={styles.prose}>按最新披露，当前没有业绩预告。</p>
      </section>
    );
  }

  return (
    <>
      {forecast.entries.map((entry, index) => (
        <section
          className={styles.card}
          key={`${entry.noticedOn ?? ""}-${index.toString()}`}
        >
          <h2 className={styles.cardTitle}>
            {entry.reportedOn ?? "业绩预告"}
            {entry.kind === null ? null : (
              <span className={styles.count}>{entry.kind}</span>
            )}
          </h2>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>预告指标</dt>
              <dd>{entry.indicator ?? "—"}</dd>
            </div>
            <div className={styles.fact}>
              <dt>预计金额</dt>
              <dd>
                {range(entry.amountLower, entry.amountUpper, formatYuan)}元
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>同比变动</dt>
              <dd>
                {range(
                  entry.changeLower,
                  entry.changeUpper,
                  (value) => `${value.toFixed(2)}%`,
                )}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>公告日期</dt>
              <dd>{entry.noticedOn ?? "—"}</dd>
            </div>
          </dl>
          {entry.content === null ? null : (
            <p className={styles.prose}>{entry.content}</p>
          )}
          {entry.reason === null ? null : (
            <p className={styles.prose}>变动原因：{entry.reason}</p>
          )}
        </section>
      ))}
    </>
  );
}

export function StatementSection({
  statement,
}: Readonly<{ statement: FinancialStatement }>) {
  const columns = statement.periods;

  return (
    <>
      {statement.sections.map((section) => (
        <section className={styles.card} key={section.title}>
          <h2 className={styles.cardTitle}>{section.title}</h2>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">项目</th>
                  {columns.map((period, index) => (
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
                {section.lines.map((line) => (
                  <tr key={line.label}>
                    <th scope="row">
                      {line.label}
                      {unitNote(line.unit) === "" ? null : (
                        <span className={styles.count}>
                          {unitNote(line.unit)}
                        </span>
                      )}
                    </th>
                    {line.values.map((value, index) => (
                      <td
                        className={styles.numeric}
                        key={`${line.label}-${index.toString()}`}
                      >
                        {formatCell(value, line.unit)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
