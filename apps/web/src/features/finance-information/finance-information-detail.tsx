"use client";

import Link from "next/link";
import { useState } from "react";

import {
  financeInformationKindLabels,
  type FinanceInformationFixture,
} from "./finance-information-fixtures";
import styles from "./finance-information.module.css";

type FinanceInformationDetailProperties = Readonly<{
  item: FinanceInformationFixture;
}>;

export function FinanceInformationDetail({
  item,
}: FinanceInformationDetailProperties) {
  const [bookmarked, setBookmarked] = useState(false);

  return (
    <article
      aria-labelledby="finance-information-detail-heading"
      className={styles.detail}
      data-testid="finance-information-detail"
    >
      <header className={styles.detailHeader}>
        <div className={styles.detailEyebrow}>
          <span>{financeInformationKindLabels[item.kind]}</span>
          <span>来源：{item.sourceLabel}</span>
        </div>
        <h2 id="finance-information-detail-heading">{item.title}</h2>
        <p>{item.summary}</p>
        <time dateTime={item.publishedAt}>{item.publishedLabel}</time>
      </header>

      <aside className={styles.detailDisclosure}>
        <strong>演示数据 / 合成数据</strong>
        <span>固定离线内容 · 不构成投资建议</span>
      </aside>

      <div className={styles.detailBody}>
        {item.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <section
        className={styles.detailSection}
        aria-labelledby="related-heading"
      >
        <h3 id="related-heading">关联合成标的</h3>
        <div className={styles.relatedListings}>
          {item.relatedListings.map((listing) => (
            <Link
              href={`/instruments/${listing.listingId}`}
              key={listing.listingId}
            >
              <strong>{listing.name}</strong>
              <span>{listing.symbol}</span>
            </Link>
          ))}
        </div>
      </section>

      <section
        className={styles.detailSection}
        aria-labelledby="topics-heading"
      >
        <h3 id="topics-heading">相关话题</h3>
        <ul className={styles.topicList}>
          {item.topics.map((topic) => (
            <li key={topic}>#{topic}</li>
          ))}
        </ul>
      </section>

      <aside className={styles.riskNotice}>
        <strong>风险提示</strong>
        <p>
          本文仅用于固定合成数据的功能演示，不对应真实媒体、公司或证券；请勿据此作出投资决策。
        </p>
      </aside>

      <footer className={styles.detailActions}>
        <button disabled type="button">
          分享（暂未开放）
        </button>
        <button
          aria-pressed={bookmarked}
          onClick={() => setBookmarked((current) => !current)}
          type="button"
        >
          {bookmarked ? "已收藏（仅本次会话）" : "收藏（仅本次会话）"}
        </button>
      </footer>
    </article>
  );
}
