"use client";

import Link from "next/link";
import { useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./community-experience.module.css";

/*
 * 收藏。
 *
 * 个人主页有「收藏」页签，但此前站内根本没有收藏这个动作——页签在那儿，
 * 点开永远是空的。现在收藏落盘，主页那一页也就有了内容。
 *
 * 与点赞同样的边界：只有落盘的用户帖能被收藏。样本卡片不在存储里，
 * 给它们一个能点的按钮，点完刷新就没了。
 */
const REAL_POST = /^post_[0-9a-f]{16}$/u;

export function BookmarkButton({ postId }: Readonly<{ postId: string }>) {
  const { account, bookmarkedPostIds, toggleBookmark } = useAccountSession();
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  if (!REAL_POST.test(postId)) return null;

  if (account === null) {
    return (
      <Link className={styles.action} href="/login">
        登录后收藏
      </Link>
    );
  }

  const bookmarked = bookmarkedPostIds.includes(postId);

  const submit = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");
    const failure = await toggleBookmark(postId);
    setPending(false);
    if (failure !== null) setStatus(failure);
  };

  return (
    <>
      <button
        aria-pressed={bookmarked}
        className={styles.action}
        disabled={pending}
        onClick={submit}
        type="button"
      >
        {bookmarked ? "已收藏" : "收藏"}
      </button>
      {status === "" ? null : (
        <span aria-live="polite" className={styles.meta}>
          {status}
        </span>
      )}
    </>
  );
}
