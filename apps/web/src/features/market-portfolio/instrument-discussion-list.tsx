import Link from "next/link";

import { listPostsBySymbol } from "../../server/social-store";
import styles from "./instrument-detail.module.css";

/*
 * 这只标的下的讨论。
 *
 * 讨论区此前只有一个发帖框：说完的话在这一页上再也看不到，别人说了什么
 * 更是无从得知。一个只能写、不能读的讨论区，不是讨论区。
 *
 * 服务端直接读，不走接口：这一页本来就是服务端渲染的，首屏就该有内容，
 * 而不是先空一块再由浏览器补上。
 */

const MAX_ROWS = 20;

/** "2026-08-13T01:23:45.000Z" → "2026-08-13 01:23"。 */
const stamp = (iso: string): string =>
  `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

export function InstrumentDiscussionList({
  symbol,
}: Readonly<{ symbol: string }>) {
  const posts = listPostsBySymbol(symbol).slice(0, MAX_ROWS);

  if (posts.length === 0) {
    return (
      <p className={styles.discussionEmpty}>
        {/*
          说清楚是还没有人说过，而不是留一块空白让人以为没加载出来。
        */}
        还没有人讨论过这只标的。上面说第一句。
      </p>
    );
  }

  return (
    <ol className={styles.discussionList}>
      {posts.map((post) => (
        <li key={post.id}>
          <p className={styles.discussionMeta}>
            <Link href={`/users/${post.authorId}`}>{post.authorName}</Link>
            <time dateTime={post.createdAt}>{stamp(post.createdAt)}</time>
          </p>
          <p className={styles.discussionBody}>{post.body}</p>
          <Link
            className={styles.discussionLink}
            href={`/community/posts/${post.id}`}
          >
            查看全文与评论
          </Link>
        </li>
      ))}
    </ol>
  );
}
