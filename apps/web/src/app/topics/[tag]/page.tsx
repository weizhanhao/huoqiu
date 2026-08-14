import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { communityFeedCards } from "../../../features/community/community-fixtures";
import styles from "../../../features/account/account.module.css";

/*
 * 话题聚合页。
 *
 * 标签过去只是 <span>，点不动——发布器却能插入 #话题#，插完没有落地页。
 * 现在每个出现过的标签都有自己的页面，列出全部带该标签的记录。
 */

type PageProperties = Readonly<{
  params: Promise<{ tag: string }>;
}>;

const allTags = (): readonly string[] => [
  ...new Set(communityFeedCards.flatMap((card) => card.tags)),
];

const cardsForTag = (tag: string) =>
  communityFeedCards.filter((card) => card.tags.includes(tag));

export function generateStaticParams(): { tag: string }[] {
  return allTags().map((tag) => ({ tag: encodeURIComponent(tag) }));
}

export async function generateMetadata({
  params,
}: PageProperties): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag);
  return {
    description: `火球社区中标记为 #${tag} 的全部记录`,
    title: `#${tag} · 火球话题`,
  };
}

export default async function TopicPage({ params }: PageProperties) {
  const tag = decodeURIComponent((await params).tag);
  const cards = cardsForTag(tag);
  if (cards.length === 0) {
    notFound();
  }

  const authors = [...new Set(cards.map((card) => card.author))];

  return (
    <DesktopShell>
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.heading}>
            <h1>#{tag}</h1>
            <p>
              共 {cards.length} 条记录，来自 {authors.length} 位作者。
            </p>
          </div>
          <p className={styles.switchLine}>
            <Link href="/community">返回社区</Link>
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.postList}>
            {cards.map((card) => (
              <article className={styles.postRow} key={card.id}>
                <Link href={card.detailHref ?? `/community/posts/${card.id}`}>
                  {card.title}
                </Link>
                <p>{card.body}</p>
                <small>
                  <Link href={`/users/${card.authorId}`}>{card.author}</Link> ·{" "}
                  {card.publishedLabel} · {card.kind}
                </small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DesktopShell>
  );
}
