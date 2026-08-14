import type { Metadata } from "next";
import Link from "next/link";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { communityFeedCards } from "../../features/community/community-fixtures";
import styles from "../../features/account/account.module.css";

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

export default function TopicsPage() {
  const rows = topics();

  return (
    <DesktopShell>
      <section aria-labelledby="topics-heading" className={styles.page}>
        <header className={styles.heading}>
          <h1 id="topics-heading">话题</h1>
          <p>社区记录里出现过的话题，按记录数排序。</p>
        </header>

        {rows.length === 0 ? (
          <p className={styles.hint}>还没有话题。</p>
        ) : (
          <ul className={styles.directory}>
            {rows.map((topic) => (
              <li className={styles.directoryRow} key={topic.tag}>
                <Link href={`/topics/${encodeURIComponent(topic.tag)}`}>
                  #{topic.tag}
                </Link>
                {/*
                  计数用 <small>，不用 styles.secondary——那个类是按钮样式
                  （带边框、hover、44px 最小高度），套在一个纯计数上，看着像
                  个能按的东西，实际点不动。
                */}
                <small>{topic.count} 条记录</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DesktopShell>
  );
}
