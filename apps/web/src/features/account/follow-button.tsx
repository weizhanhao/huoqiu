"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "./account.module.css";
import { useAccountSession } from "./account-session";

/*
 * 真实关注按钮。
 *
 * 与站内旧的三处「关注」不同（那些只翻转一个本地 boolean，刷新即回退），
 * 这个会把关注关系写进 .runtime/social/social-v1.json，刷新、换页、重启进程
 * 都还在，并且立刻反映到对方主页的粉丝数和自己侧栏的关注数上。
 *
 * 未登录时不渲染禁用按钮，而是给一条通往 /login 的真链接——
 * 「点了没反应」正是要消灭的东西。
 */
export function FollowButton({
  targetId,
  targetName,
}: Readonly<{ targetId: string; targetName: string }>) {
  const { account, following, toggleFollow } = useAccountSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (account === null) {
    return (
      <Link className={styles.followButton} href="/login">
        登录后关注
      </Link>
    );
  }

  if (account.id === targetId) {
    return (
      <Link className={styles.followButton} href="/settings">
        编辑资料
      </Link>
    );
  }

  const isFollowing = following.includes(targetId);

  const click = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError("");
    const failure = await toggleFollow(targetId);
    setPending(false);
    if (failure !== null) {
      setError(failure);
    }
  };

  return (
    <span className={styles.followSlot}>
      <button
        aria-label={isFollowing ? `取消关注 ${targetName}` : `关注 ${targetName}`}
        aria-pressed={isFollowing}
        className={styles.followButton}
        disabled={pending}
        onClick={click}
        type="button"
      >
        {pending ? "处理中" : isFollowing ? "已关注" : "关注"}
      </button>
      {error === "" ? null : (
        <small className={styles.followError} role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
