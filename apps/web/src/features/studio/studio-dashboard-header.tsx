"use client";

import Link from "next/link";

import { useAccountSession } from "../account/account-session";
import styles from "./studio-page.module.css";

/**
 * 创作者首页页头。
 *
 * 账号数据只读当前会话，不另发请求，也不用演示数字填空。把身份与主操作放在
 * 正文开头，左栏就只负责导航；两类信息不再挤成一团。
 */
export function StudioDashboardHeader() {
  const { account, loading } = useAccountSession();
  const name = account?.displayName ?? (loading ? "正在读取账号" : "尚未登录");
  const caption =
    account?.email ?? (loading ? " " : "登录后管理作品与创作数据");
  const avatar =
    account === null ? "火" : ([...account.displayName][0] ?? "火");

  return (
    <section className={styles.dashboardHeader}>
      <div className={styles.dashboardIdentity}>
        <p className={styles.eyebrow}>CREATOR SPACE · 创作工作台</p>
        <h1>
          把灵感，写成
          <span>有影响力的观点。</span>
        </h1>
        <p className={styles.dashboardLead}>
          记录市场判断、沉淀长期思考，也让每一次表达被真正看见。
        </p>
        <div className={styles.accountChip}>
          <span aria-hidden="true" className={styles.dashboardAvatar}>
            {avatar}
          </span>
          <span>
            <strong>{name}</strong>
            <small>{caption}</small>
          </span>
        </div>
        <dl aria-label="创作者账号概览" className={styles.dashboardStats}>
          <div>
            <dt>作品</dt>
            <dd>{account?.postCount ?? "—"}</dd>
          </div>
          <div>
            <dt>粉丝</dt>
            <dd>{account?.followerCount ?? "—"}</dd>
          </div>
          <div>
            <dt>关注</dt>
            <dd>{account?.followingCount ?? "—"}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.dashboardActions}>
        <div className={styles.composerHeading}>
          <span aria-hidden="true">✦</span>
          <p>开始创作</p>
          <small>NEW STORY</small>
        </div>
        <h2>此刻，最值得记录的判断是什么？</h2>
        <p>从一个标题开始，把零散想法整理成完整长文。</p>
        <Link
          className={styles.workspaceAction}
          href={account === null ? "/login" : "/studio/publish"}
        >
          <span aria-hidden="true" className={styles.actionPlus}>
            +
          </span>
          {account === null ? "登录后开始创作" : "写一篇长文"}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
