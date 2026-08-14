"use client";

import Link from "next/link";
import { useState } from "react";

import { useAccountSession } from "../account/account-session";
import { formatCommunityCount } from "./community-content-model";
import styles from "./community-experience.module.css";

/*
 * 点赞。
 *
 * 卡片上的「N 赞」此前是个静态数字，详情页的赞则只活在客户端会话里——刷新
 * 即失，别人也看不到。于是通知里的「赞我的」永远是空的：不是没人赞，是赞
 * 从来没留下过。
 *
 * 现在真实帖子的赞会落盘，赞数由服务端按 likes 表现算，并且会成为被赞者的
 * 一条真实通知。
 */

/*
 * 只有落盘的用户帖能被赞。
 *
 * 样本卡片（post_syn_*、article_syn_* 等）不在存储里，给它们做一个能点的
 * 按钮，点完刷新就没了——那正是这一轮要消灭的「点了像是有用」。
 */
const REAL_POST = /^post_[0-9a-f]{16}$/u;

export function LikeButton({
  fallbackCount,
  postId,
}: Readonly<{ fallbackCount: number; postId: string }>) {
  const { account, likedPostIds, posts, toggleLike } = useAccountSession();
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  if (!REAL_POST.test(postId)) {
    return <span>{formatCommunityCount(fallbackCount)} 赞</span>;
  }

  if (account === null) {
    // 未登录给一条通往登录页的真链接，而不是一个点了没反应的按钮。
    return (
      <Link className={styles.action} href="/login">
        登录后点赞
      </Link>
    );
  }

  const liked = likedPostIds.includes(postId);
  const count =
    posts.find((post) => post.id === postId)?.likeCount ?? fallbackCount;

  const submit = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");
    const failure = await toggleLike(postId);
    setPending(false);
    if (failure !== null) setStatus(failure);
  };

  return (
    <>
      <button
        aria-pressed={liked}
        className={styles.action}
        disabled={pending}
        onClick={submit}
        type="button"
      >
        {liked ? "已赞" : "赞"} {formatCommunityCount(count)}
      </button>
      {status === "" ? null : (
        <span aria-live="polite" className={styles.meta}>
          {status}
        </span>
      )}
    </>
  );
}
