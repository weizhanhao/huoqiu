import type { Metadata } from "next";
import Link from "next/link";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { communityFeedCards } from "../../features/community/community-fixtures";
import styles from "./topics.module.css";

/*
 * 话题广场。
 *
 * `/topics/[tag]` 早就有了，但全站没有一个地方链到它——只能手输地址才能
 * 到达，等于做了不算做。这一页把出现过的话题列出来，按记录数排序。
 */

export const metadata: Metadata = {
  description: "火球社区中出现过的全部话题",
  title: "话题 · 火球",
};

type Topic = Readonly<{ count: number; tag: string }>;

const PAGE_SIZE = 10;

const topics = (): readonly Topic[] => {
  const counts = new Map<string, number>();
  for (const card of communityFeedCards) {
    for (const tag of card.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return (
    [...counts.entries()]
      .map(([tag, count]) => ({ count, tag }))
      /* 记录多的排前面；一样多时按名字排，免得每次构建顺序都不一样。 */
      .sort((left, right) =>
        right.count === left.count
          ? left.tag.localeCompare(right.tag, "zh-CN")
          : right.count - left.count,
      )
  );
};

type TopicsPageProperties = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const pageValue = (value: string | string[] | undefined): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const pageHref = (page: number): string =>
  page === 1 ? "/topics" : `/topics?page=${page}`;

export default async function TopicsPage({
  searchParams,
}: TopicsPageProperties) {
  const rows = topics();
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(pageValue((await searchParams).page), pageCount);
  const visibleRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <DesktopShell>
      <section
        aria-labelledby="topics-heading"
        className={styles.page}
        data-testid="topics-hub"
      >
        <header className={styles.heading}>
          <h1 id="topics-heading">话题</h1>
          <p>社区记录里出现过的话题，按记录数排序，共 {rows.length} 个。</p>
        </header>

        {rows.length === 0 ? (
          <p className={styles.hint}>还没有话题。</p>
        ) : (
          <ul className={styles.directory}>
            {visibleRows.map((topic) => (
              <li className={styles.directoryRow} key={topic.tag}>
                <Link href={`/topics/${encodeURIComponent(topic.tag)}`}>
                  <span className={styles.topicName}>
                    <span aria-hidden="true">#</span>
                    {topic.tag}
                  </span>
                  <small>{topic.count} 条记录</small>
                  <span aria-hidden="true" className={styles.chevron}>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 ? (
          <nav
            aria-label="话题分页"
            className={`${styles.pagination} hq-pagination`}
          >
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1)}>上一页</Link>
            ) : (
              <span aria-disabled="true">上一页</span>
            )}
            <span className={styles.pageStatus}>
              第 {currentPage} / {pageCount} 页
            </span>
            {currentPage < pageCount ? (
              <Link href={pageHref(currentPage + 1)}>下一页</Link>
            ) : (
              <span aria-disabled="true">下一页</span>
            )}
          </nav>
        ) : null}
      </section>
    </DesktopShell>
  );
}
