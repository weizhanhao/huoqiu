import Link from "next/link";

import { getCommunityAuthor } from "./community-author-fixtures";
import { formatCommunityCount, type FeedCard } from "./community-content-model";
import { BlockAuthorButton } from "./block-author-button";
import styles from "./community-experience.module.css";
import { BookmarkButton } from "./bookmark-button";
import { LikeButton } from "./like-button";
import { RepostButton } from "./repost-button";

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
          <strong>
            <Link href={`/users/${card.authorId}`}>{card.author}</Link>
          </strong>
          <span className={styles.meta}>
            {author?.role ?? "社区作者"} · {card.publishedLabel}
          </span>
        </div>
        {/*
          来源标注不能省：读者有权知道这条是编辑部维护的栏目记录，
          还是注册用户自己发的。栏目账号在 author fixtures 里有登记，
          用户帖子没有，因此这里只给前者加标。
        */}
        {author === undefined ? null : (
          <span className={styles.syntheticBadge}>栏目</span>
        )}
        <BlockAuthorButton authorId={card.authorId} authorName={card.author} />
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
          <Link href={`/topics/${encodeURIComponent(tag)}`} key={tag}>
            #{tag}
          </Link>
        ))}
      </div>
      <footer className={styles.cardFooter}>
        <div className={styles.engagement} aria-label="互动统计">
          <span>{formatCommunityCount(card.engagement.reposts)} 转发</span>
          <span>{formatCommunityCount(card.engagement.comments)} 评论</span>
          {/*
            真实帖子的赞会落盘并成为对方的一条真实通知；样本卡片仍是静态
            数字——给它做个能点的按钮，点完刷新就没了，那是假的可用。
          */}
          <LikeButton fallbackCount={card.engagement.likes} postId={card.id} />
          <span>{formatCommunityCount(card.engagement.views)} 次浏览</span>
        </div>
        {/*
          每条记录都有自己的永久链接，不再有「点不动」的条目：
          detailHref 缺省时按 id 回落到帖子路由。
        */}
        <BookmarkButton postId={card.id} />
        <RepostButton postId={card.id} postTitle={card.title} />
        <Link href={card.detailHref ?? `/community/posts/${card.id}`}>
          查看完整帖子
        </Link>
      </footer>
    </article>
  );
}
