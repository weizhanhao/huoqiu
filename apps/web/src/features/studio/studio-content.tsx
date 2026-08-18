"use client";

import Link from "next/link";

import {
  postPermalink,
  selectStudioPosts,
  type StudioScope,
} from "./select-posts";
import styles from "./studio-page.module.css";
import { useStudioData } from "./studio-data";

/*
 * 内容管理与草稿箱共用的一张列表。
 *
 * 三处（我的作品、讨论草稿、长文草稿）只是筛选条件不同，列表本身是同一个。
 * 各写一遍的话，三处的空态、失败态、时间格式迟早各走各的。
 */

const formatTime = (value: string): string =>
  value.slice(0, 16).replace("T", " ");

export function StudioContentList({
  emptyHint,
  heading,
  scope,
}: Readonly<{
  emptyHint: string;
  heading: string;
  scope: StudioScope;
}>) {
  const { state } = useStudioData();

  if (state.kind === "anonymous") {
    return (
      <section className={styles.card}>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.statusBar}>
          <Link href="/login">登录</Link>后可以看到自己的内容。
        </p>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={`正在读取${heading}`}
        className={styles.loadingCard}
      >
        <span className={styles.loadingTitle} />
        <div className={styles.loadingRows}>
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.kind === "failed") {
    /* 取不到就说取不到——空列表会让人以为自己什么都没写过。 */
    return (
      <section className={styles.card}>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.statusBar}>内容暂时取不到，请稍后再试。</p>
      </section>
    );
  }

  const rows = selectStudioPosts(state.data.posts, scope);

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>
        {heading}
        <small className={styles.subheading}> 共 {rows.length} 条</small>
      </h2>

      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyHint}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">标题</th>
              <th scope="col">类型</th>
              <th scope="col">状态</th>
              <th scope="col">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => (
              <tr key={post.id}>
                <td>
                  {/*
                    草稿没有公开地址，点进去会是 404——所以只有已发布的
                    才是链接。给草稿也挂链接，等于先许诺再落空。
                  */}
                  {post.status === "published" ? (
                    <Link
                      className={styles.rowTitle}
                      href={postPermalink(post.id)}
                    >
                      {post.title.length > 0 ? post.title : "（无标题）"}
                    </Link>
                  ) : (
                    <span className={styles.rowTitle}>
                      {post.title.length > 0 ? post.title : "（无标题）"}
                    </span>
                  )}
                  <span className={styles.rowBody}>{post.body}</span>
                </td>
                <td>
                  <span className={styles.tag}>
                    {post.kind === "article" ? "长文" : "讨论"}
                  </span>
                </td>
                <td>
                  <span className={styles.tag}>
                    {post.status === "published" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className={styles.numeric}>
                  {formatTime(post.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
