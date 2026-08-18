"use client";

import Link from "next/link";

import { useAccountSession } from "../account/account-session";
import styles from "./studio-account-summary.module.css";

/**
 * 创作者工作台的真实账号摘要。
 *
 * 只复用当前会话已经加载的账号数据，不再发一遍请求。加载、未登录和已登录
 * 使用同一套几何结构，避免左栏在数据回来时上下跳动。
 */
export function StudioAccountSummary() {
  const { account, loading } = useAccountSession();
  const name = account?.displayName ?? (loading ? "读取账号…" : "尚未登录");
  const caption = account?.email ?? (loading ? " " : "登录后管理创作");
  const avatar =
    account === null ? "火" : ([...account.displayName][0] ?? "火");
  const href = account === null ? "/login" : `/users/${account.id}`;

  return (
    <section aria-label="创作者账号" className={styles.summary}>
      <Link className={styles.identity} href={href}>
        <span aria-hidden="true" className={styles.avatar}>
          {avatar}
        </span>
        <span className={styles.copy}>
          <strong>{name}</strong>
          <small>{caption}</small>
        </span>
      </Link>
      <dl className={styles.stats}>
        <div>
          <dt>作品</dt>
          <dd>{account?.postCount ?? "—"}</dd>
        </div>
        <div>
          <dt>粉丝</dt>
          <dd>{account?.followerCount ?? "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
