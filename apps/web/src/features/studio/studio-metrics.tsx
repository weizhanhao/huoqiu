"use client";

import Link from "next/link";

import { postPermalink } from "./select-posts";
import styles from "./studio-page.module.css";
import { useStudioData } from "./studio-data";

/*
 * 数据中心。
 *
 * 每一格都从库里数出来，没有估算。数不出来的那几项（转发量、主页访问量）
 * 这里根本没有——雪球那一栏有，我们没有埋点，编一个填上去比空着糟得多。
 */

const yesterdayKey = (): string => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
};

export function StudioMetrics({
  scope,
}: Readonly<{ scope: "content" | "followers" }>) {
  const { state } = useStudioData();

  if (state.kind === "anonymous") {
    return (
      <section className={styles.card}>
        <p className="page-state-message">
          <Link href="/login">登录</Link>后可以看到自己的数据。
        </p>
      </section>
    );
  }
  if (state.kind === "loading") {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>正在读取……</p>
      </section>
    );
  }
  if (state.kind === "failed") {
    return (
      <section className={styles.card}>
        <p className="page-state-message">数据暂时取不到，请稍后再试。</p>
      </section>
    );
  }

  const { followerCount, stats } = state.data;
  const yesterday = stats.viewsByDate[yesterdayKey()] ?? 0;

  const cells =
    scope === "followers"
      ? [{ label: "粉丝量", primary: true, value: followerCount }]
      : [
          { label: "阅读量", primary: true, value: stats.totalViews },
          { label: "讨论量", primary: false, value: stats.commentCount },
          { label: "点赞量", primary: false, value: stats.likeCount },
          { label: "收藏量", primary: false, value: stats.bookmarkCount },
          { label: "已发布", primary: false, value: stats.publishedCount },
        ];

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>
        {scope === "followers" ? "粉丝数据" : "数据总览"}
      </h2>

      <div className={styles.metrics}>
        {cells.map((cell) => (
          <div
            className={`${styles.metric} ${cell.primary ? styles.metricPrimary : ""}`}
            key={cell.label}
          >
            <span className={styles.metricLabel}>{cell.label}</span>
            <strong className={styles.metricValue}>{cell.value}</strong>
          </div>
        ))}
      </div>

      {scope === "content" ? (
        <p className={styles.subheading}>昨天阅读量：{yesterday}</p>
      ) : null}

      {/*
        说清楚哪些数字这里没有。留白让人以为是零，而实际上是没记。
      */}
      <p className={styles.subheading}>
        {scope === "followers"
          ? "粉丝量按真实关注关系统计。新增粉丝与主页访问量站内未做记录，因此不在这里显示。"
          : "阅读量按帖子页的真实浏览按天记录；讨论、点赞、收藏取自真实互动。转发量站内未单独记录，因此不在这里显示。"}
      </p>
    </section>
  );
}

/** 作品维度的明细：每篇各自的互动数。 */
export function StudioPostMetrics() {
  const { state } = useStudioData();

  if (state.kind !== "ready") {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>
          {state.kind === "loading" ? "正在读取……" : "数据暂时取不到。"}
        </p>
      </section>
    );
  }

  const published = state.data.posts.filter(
    (post) => post.status === "published",
  );

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>作品详情</h2>
      {published.length === 0 ? (
        <p className={styles.empty}>还没有已发布的作品。</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">作品名称</th>
              <th scope="col">类型</th>
              <th scope="col">发布时间</th>
              <th scope="col">阅读量</th>
            </tr>
          </thead>
          <tbody>
            {published.map((post) => (
              <tr key={post.id}>
                <td>
                  <Link
                    className={styles.rowTitle}
                    href={postPermalink(post.id)}
                  >
                    {post.title.length > 0 ? post.title : "（无标题）"}
                  </Link>
                </td>
                <td>
                  <span className={styles.tag}>
                    {post.kind === "article" ? "长文" : "讨论"}
                  </span>
                </td>
                <td className={styles.numeric}>
                  {post.created_at.slice(0, 10)}
                </td>
                <td className={styles.numeric}>{post.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/*
        这里的阅读量按帖子分别记：每打开一次帖子页记一笔，逐篇累计。
        此前这一列缺着，因为站内只有按作者汇总的数——拿汇总值填每一行，
        每篇会显示同一个数字，而那个数字一眼看不出是假的。
      */}
    </section>
  );
}
