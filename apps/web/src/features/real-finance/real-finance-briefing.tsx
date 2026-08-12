import Link from "next/link";

import type {
  FinancePublicRecordViewModel,
  FinancePublicViewModel,
} from "./finance-public-view-model";
import styles from "./real-finance.module.css";
import {
  canDisplayFinanceRecords,
  FinanceExternalSourceLink,
  financeKindLabels,
  financeSourceLabels,
  FinanceStateNotice,
  formatCstDate,
  formatCstDateTime,
} from "./real-finance-shared";

type RealFinanceBriefingProperties = Readonly<{
  model: FinancePublicViewModel;
}>;

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const groupByCstDate = (records: readonly FinancePublicRecordViewModel[]) => {
  const groups = new Map<string, FinancePublicRecordViewModel[]>();

  for (const record of records) {
    const date = formatCstDate(record.publishedAt);
    const group = groups.get(date) ?? [];
    group.push(record);
    groups.set(date, group);
  }

  return [...groups.entries()];
};

export function RealFinanceBriefing({ model }: RealFinanceBriefingProperties) {
  const latestRecords = canDisplayFinanceRecords(model.state)
    ? [...model.records]
        .sort(
          (left, right) =>
            toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt),
        )
        .slice(0, 20)
    : [];
  const dateGroups = groupByCstDate(latestRecords);

  return (
    <main
      className={styles.surface}
      data-testid="real-finance-briefing"
      lang="zh-CN"
    >
      <header className={styles.hero}>
        <p>7×24 · 官方申报、公开新闻线索与宏观发布</p>
        <h1>最新 20 条真实来源记录</h1>
        <p>按绝对时间排序，仅链接到原始来源</p>
      </header>

      <FinanceStateNotice message={model.statusMessage} state={model.state} />

      {dateGroups.map(([date, records]) => (
        <section
          aria-label={`${date} 快讯`}
          className={styles.sectionPanel}
          key={date}
        >
          <div className={styles.timelineDate}>
            <h2>{date}</h2>
            <p>{records.length} 条公开记录</p>
          </div>
          <ol className={styles.timelineList}>
            {records.map((record) => (
              <li data-briefing-item="true" key={record.id}>
                <div className={styles.timelineMeta}>
                  <time dateTime={record.publishedAt}>
                    {formatCstDateTime(record.publishedAt)}
                  </time>
                  <span>{financeSourceLabels[record.sourceId]}</span>
                  <span>{financeKindLabels[record.kind]}</span>
                  <span>
                    {record.freshness === "fresh" ? "新鲜" : "已陈旧"}
                  </span>
                </div>
                <h3>
                  <FinanceExternalSourceLink
                    className={styles.recordLink}
                    language={record.language}
                    record={record}
                  >
                    {record.title}
                  </FinanceExternalSourceLink>
                </h3>
                <p className={styles.publisher}>
                  {record.sourceId === "gdelt" && "原发布域 · "}
                  {record.publisher}
                </p>
                <p className={styles.attribution}>
                  {record.sourceId === "gdelt" && "元数据来自 GDELT · "}
                  {record.attribution}
                </p>
                <div className={styles.recordActions}>
                  <Link href={`/news/${record.id}`}>查看站内详情</Link>
                  <FinanceExternalSourceLink
                    className={styles.recordSourceAction}
                    record={record}
                  >
                    原始来源
                  </FinanceExternalSourceLink>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
