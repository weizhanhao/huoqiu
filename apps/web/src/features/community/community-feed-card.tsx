import Link from "next/link";

import { getCommunityAuthor } from "./community-author-fixtures";
import { formatCommunityCount, type FeedCard } from "./community-content-model";
import styles from "./community-experience.module.css";

export function CommunityFeedCard({ card }: Readonly<{ card: FeedCard }>) {
  const author = getCommunityAuthor(card.authorId);

  return (
    <article
      className={styles.card}
      data-card-id={card.id}
      data-testid="community-feed-card"
    >
      <header className={styles.cardAuthor}>
        <span className={styles.avatar} aria-hidden="true">
          {author?.initials ?? card.author.slice(0, 1)}
        </span>
        <div className={styles.cardAuthorCopy}>
          <strong>{card.author}</strong>
          <span className={styles.meta}>
            {author?.role ?? "合成社区作者"} · {card.publishedLabel}
          </span>
        </div>
        <span className={styles.syntheticBadge}>SYNTHETIC / 固定演示内容</span>
      </header>

      <div className={styles.cardTitleRow}>
        <span className={styles.kind}>{card.kind}</span>
        {card.readTime ? (
          <span className={styles.meta}>{card.readTime}</span>
        ) : null}
      </div>
      <h3>{card.title}</h3>
      <p>{card.body}</p>

      {card.media ? (
        <figure
          className={`${styles.mediaPlaceholder} ${styles[card.media.type]}`}
          aria-label={card.media.alt}
        >
          <div className={styles.mediaArtwork} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <figcaption>
            <span>本地媒体占位</span>
            <span>{card.media.label}</span>
            {card.media.duration ? (
              <strong>{card.media.duration}</strong>
            ) : null}
          </figcaption>
        </figure>
      ) : null}

      <div className={styles.tagList} aria-label="内容标签">
        {card.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <footer className={styles.cardFooter}>
        <div className={styles.engagement} aria-label="固定合成互动统计">
          <span>{formatCommunityCount(card.engagement.reposts)} 转发</span>
          <span>{formatCommunityCount(card.engagement.comments)} 评论</span>
          <span>{formatCommunityCount(card.engagement.likes)} 赞</span>
          <span>{formatCommunityCount(card.engagement.views)} 次合成浏览</span>
        </div>
        {card.detailHref ? (
          <Link href={card.detailHref}>查看完整帖子</Link>
        ) : (
          <span>固定合成内容</span>
        )}
      </footer>
    </article>
  );
}
