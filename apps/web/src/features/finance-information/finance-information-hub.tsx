"use client";

import Link from "next/link";
import { useState } from "react";

import {
  financeInformationChannels,
  financeInformationKindLabels,
  queryFinanceInformation,
  type FinanceInformationChannel,
} from "./finance-information-fixtures";
import styles from "./finance-information.module.css";

type FinanceInformationHubProperties = Readonly<{
  initialChannel?: FinanceInformationChannel;
  initialQuery?: string;
}>;

export function FinanceInformationHub({
  initialChannel = "all",
  initialQuery = "",
}: FinanceInformationHubProperties) {
  const [channel, setChannel] = useState(initialChannel);
  const [query, setQuery] = useState(initialQuery);
  const items = queryFinanceInformation({ channel, query });

  return (
    <section
      aria-labelledby="finance-information-heading"
      className={styles.pageStack}
      data-testid="finance-information-hub"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>FIXED FINANCE INFORMATION DESK</p>
          <h2 id="finance-information-heading">财经资讯</h2>
          <p>按市场、公司、公告与专栏整理固定离线内容。</p>
        </div>
        <div className={styles.disclosure}>
          <strong>演示数据 / 合成数据</strong>
          <span>固定快照 · 不构成投资建议</span>
        </div>
      </header>

      <nav aria-label="财经资讯频道" className={styles.channels}>
        {financeInformationChannels.map((candidate) => (
          <button
            aria-pressed={channel === candidate.id}
            key={candidate.id}
            onClick={() => setChannel(candidate.id)}
            type="button"
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      <label className={styles.localSearch}>
        <span>本地搜索资讯或合成标的</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入标题、标的名称或合成代码"
          type="search"
          value={query}
        />
      </label>

      <p aria-live="polite" className={styles.resultStatus}>
        当前显示 {items.length} 条固定合成资讯
      </p>

      {items.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <strong>没有匹配的合成资讯</strong>
          <p>请更换频道或搜索词；本页不会向外部数据源发起请求。</p>
        </div>
      ) : (
        <div className={styles.storyList}>
          {items.map((item) => (
            <article className={styles.storyCard} key={item.id}>
              <header className={styles.storyMeta}>
                <span>{financeInformationKindLabels[item.kind]}</span>
                <time dateTime={item.publishedAt}>{item.publishedLabel}</time>
              </header>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <footer className={styles.storyFooter}>
                <span>来源：{item.sourceLabel}</span>
                <Link href={`/news/${item.id}`}>阅读全文</Link>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
