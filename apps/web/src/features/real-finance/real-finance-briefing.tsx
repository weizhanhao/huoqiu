import Link from "next/link";

import type {
  FinancePublicRecordViewModel,
  FinancePublicViewModel,
} from "./finance-public-view-model";
import { LiveNewsFeed } from "./live-news-feed";
import { MarketAnnouncementsFeed } from "./market-announcements-feed";
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
        <p>7×24 · 实时快讯与官方申报</p>
        <h1>7×24 快讯</h1>
        <p>按绝对时间排序，仅链接到原始来源</p>
      </header>

      {/*
        实时快讯在前，官方申报在后。
        这一页原先只有下面那份申报快照——真数据，但更新得慢，最新一条常常
        是两天前的，而栏目名叫 7×24。快讯自己取自己刷，不挂在那份快照上。
      */}
      <LiveNewsFeed />

      {/*
        A 股公告。
        这一块顶掉了下面那份 SEC 快照的位置：那是美股申报，而这是雪球复刻站，
        「官方申报」栏目列美股本身就不对题；何况它还得靠一个需要 SEC 可联系
        身份的脚本刷新，最新一条常常停在两天前。巨潮不需要身份，是分钟级的。
      */}
      <MarketAnnouncementsFeed />

      <div className={styles.sectionHeading}>
        <h2>境外申报存档</h2>
        <span className={styles.muted}>SEC EDGAR · 定期更新</span>
      </div>

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
