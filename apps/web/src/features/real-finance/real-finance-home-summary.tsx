import Link from "next/link";

import type { FinancePublicViewModel } from "./finance-public-view-model";
import styles from "./real-finance.module.css";
import {
  canDisplayFinanceRecords,
  FinanceExternalSourceLink,
  financeSourceLabels,
  FinanceStateNotice,
  formatCstDateTime,
} from "./real-finance-shared";

type RealFinanceHomeSummaryProperties = Readonly<{
  model: FinancePublicViewModel;
}>;

export function RealFinanceHomeSummary({
  model,
}: RealFinanceHomeSummaryProperties) {
  const records = canDisplayFinanceRecords(model.state)
    ? model.records.slice(0, 6)
    : [];

  return (
    <section
      aria-labelledby="real-finance-home-heading"
      className={styles.homeSummary}
      data-testid="real-finance-home-summary"
    >
      <header className={styles.homeSummaryHeading}>
        <div>
          <p>REAL-SOURCE FINANCE</p>
          <h2 id="real-finance-home-heading">真实财经来源</h2>
          <span>SEC EDGAR、GDELT 与国家统计局公共快照</span>
        </div>
        <Link href="/news">查看全部真实资讯</Link>
      </header>

      <FinanceStateNotice message={model.statusMessage} state={model.state} />

      {records.length > 0 && (
        <div className={styles.homeSummaryGrid}>
          {records.map((record) => (
            <article
              className={styles.homeSummaryCard}
              data-home-finance-record="true"
              key={record.id}
            >
              <div className={styles.homeSummaryMeta}>
                <span>{financeSourceLabels[record.sourceId]}</span>
                <time dateTime={record.publishedAt}>
                  {formatCstDateTime(record.publishedAt)}
                </time>
              </div>
              <h3 lang={record.language}>
                <Link
                  className={styles.homeDetailLink}
                  href={`/news/${record.id}`}
                >
                  {record.title}
                </Link>
              </h3>
              <p>{record.publisher}</p>
              <div className={styles.homeSummaryActions}>
                <span>
                  {record.freshness === "fresh" ? "新鲜" : "可能过期"}
                </span>
                <FinanceExternalSourceLink
                  className={styles.homeSourceLink}
                  record={record}
                >
                  原始来源
                </FinanceExternalSourceLink>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
