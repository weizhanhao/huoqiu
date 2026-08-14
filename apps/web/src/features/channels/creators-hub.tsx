"use client";

import { useState } from "react";

import { communityAuthors } from "../community/community-author-fixtures";
import { formatCommunityCount } from "../community/community-content-model";
import styles from "./channels.module.css";

/**
 * 达人频道。
 *
 * 作者资料直接复用社区的 communityAuthors，不另造一份——
 * 同一批作者出现两套资料迟早会漂移。
 * 关注状态仅当前会话有效，刷新即重置，与社区其他互动一致。
 */
export function CreatorsHub() {
  const [followed, setFollowed] = useState<readonly string[]>([]);
  const ranked = communityAuthors.toSorted(
    (left, right) => right.followers - left.followers,
  );

  const toggle = (id: string) =>
    setFollowed((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );

  return (
    <section
      aria-labelledby="creators-heading"
      className={styles.page}
      data-testid="creators-hub"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>达人榜</p>
          <h1 id="creators-heading">达人榜</h1>
        </div>
        <p className={styles.heroNote}>
          合成演示作者：不对应任何真实人物，关注状态仅本次会话保存。
        </p>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h3>按关注数排序</h3>
          <span>{ranked.length} 位</span>
        </div>
        <ul className={styles.rows}>
          {ranked.map((author, index) => {
            const isFollowed = followed.includes(author.id);
            return (
              <li key={author.id}>
                <div className={styles.creatorRow}>
                  <span className={styles.rank}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span aria-hidden="true" className={styles.avatar}>
                    {author.initials}
                  </span>
                  <span className={styles.creatorBody}>
                    <strong>{author.displayName}</strong>
                    <p>{author.bio}</p>
                    <span className={styles.creatorStats}>
                      <span>{author.role}</span>
                      <span>
                        {formatCommunityCount(author.followers)} 位合成关注者
                      </span>
                      <span>{author.notes} 篇固定笔记</span>
                    </span>
                  </span>
                  <button
                    aria-label={`${isFollowed ? "取消关注" : "关注"}${author.displayName}`}
                    aria-pressed={isFollowed}
                    className={styles.followButton}
                    onClick={() => toggle(author.id)}
                    type="button"
                  >
                    {isFollowed ? "已关注" : "关注"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
