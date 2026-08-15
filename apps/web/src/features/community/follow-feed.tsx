"use client";

import Link from "next/link";

import styles from "./follow-feed.module.css";
import { useAccountSession } from "../account/account-session";

/*
 * 关注流。
 *
 * 只做一件事：把你关注的人发的帖子按时间倒序列出来。
 *
 * 这一页此前套的是热门那整套版面——社区观察、达人观察席、频道介绍全都在，
 * 唯独没有「关注的人发了什么」。点进「关注」看到的和点「热门」一模一样，
 * 那这个页签就没有存在的意义。
 */

/*
 * 短帖没有标题。
 *
 * 发短帖时标题是正文前 24 个字截出来的（post-composer.tsx），不是作者另写的。
 * 照着把标题和正文都印出来，同一句话会连着出现两遍——第一遍还带着半个词的
 * 截断。只有长文才是作者自己起的标题。
 */
const hasWrittenTitle = (title: string, body: string): boolean =>
  !body.trim().startsWith(title.trim());

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(parsed);
};

type StreamProperties = Readonly<{ children: React.ReactNode }>;

/* 三种状态用同一个外框，省得每处各写一遍 aria 与 testid。 */
function Stream({ children }: StreamProperties) {
  return (
    <section
      aria-label="关注"
      className={styles.stream}
      data-testid="follow-stream"
    >
      {children}
    </section>
  );
}

export function FollowFeed() {
  const { account, following, posts } = useAccountSession();

  if (account === null) {
    return (
      <Stream>
        <p className="page-state-message">
          <Link href="/login">登录</Link>后这里会显示你关注的人发的内容。
        </p>
      </Stream>
    );
  }

  /* 只留关注对象发的。自己的帖子在「我的主页」，不在这里。 */
  const followed = posts
    .filter((post) => following.includes(post.authorId))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (followed.length === 0) {
    return (
      <Stream>
        <p className="page-state-message">
          {following.length === 0
            ? "还没有关注任何人。在别人的主页点「关注」，他发的内容就会出现在这里。"
            : "你关注的人还没有发过内容。"}
        </p>
      </Stream>
    );
  }

  return (
    <Stream>
      {followed.map((post) => (
        <article className={styles.card} key={post.id}>
          <header className={styles.author}>
            {/*
              头像和昵称在同一个链接里：分开写，昵称那一行只有 30px 高，
              手指点不准，读屏也要把同一个人念两遍。
            */}
            <Link className={styles.identity} href={`/users/${post.authorId}`}>
              <span aria-hidden="true" className={styles.avatar}>
                {post.authorName.slice(0, 1)}
              </span>
              <strong>{post.authorName}</strong>
            </Link>
            <time className={styles.time} dateTime={post.createdAt}>
              {formatTime(post.createdAt)}
            </time>
          </header>
          {hasWrittenTitle(post.title, post.body) ? (
            <h3 className={styles.title}>
              <Link href={`/community/posts/${post.id}`}>{post.title}</Link>
            </h3>
          ) : null}
          <p className={styles.body}>
            <Link
              className={styles.bodyLink}
              href={`/community/posts/${post.id}`}
            >
              {post.body}
            </Link>
          </p>
        </article>
      ))}
    </Stream>
  );
}
