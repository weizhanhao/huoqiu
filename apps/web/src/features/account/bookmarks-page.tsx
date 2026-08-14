"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountSession } from "./account-session";
import styles from "./account.module.css";

/*
 * 收藏。
 *
 * 收藏这件事本来就在做（收藏按钮、bookmarks 表、个人主页上的「收藏」页签
 * 都是真的），但它没有自己的页面——只能先进主页、再切页签才能看到，
 * 左栏也没有入口。雪球把「收藏」放在「我的」里，这一页把它补上。
 *
 * 数据走 /api/social/profile：那条接口要令牌，而且只返回本人的数据
 * （换个 id 去问会得到 403）。收藏过什么等于在关注什么，那是私事。
 */

type BookmarkedPost = Readonly<{
  body: string;
  href: string;
  id: string;
  publishedLabel: string;
  title: string;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; posts: readonly BookmarkedPost[] }>
  | Readonly<{ kind: "signedOut" }>;

export function BookmarksPage() {
  const { account, authorizedFetch, loading } = useAccountSession();
  /*
   * 这里只存「取数的结果」。
   *
   * 「还在确认登录状态」和「没登录」都是从会话直接看得出来的，存进 state
   * 只会多一份要同步的副本——会话变了而这份没跟上，页面就会说没登录。
   * 见下面 state 的推导。
   */
  const [fetched, setFetched] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (loading || account === null) return undefined;

    let cancelled = false;
    void (async () => {
      setFetched({ kind: "loading" });
      try {
        const response = await authorizedFetch("/api/social/profile", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          setFetched({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          bookmarks?: readonly BookmarkedPost[];
        };
        if (cancelled) return;
        setFetched({ kind: "ready", posts: data.bookmarks ?? [] });
      } catch {
        if (!cancelled) setFetched({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch, loading]);

  const state: State = loading
    ? { kind: "loading" }
    : account === null
      ? { kind: "signedOut" }
      : fetched;

  return (
    <section aria-labelledby="bookmarks-heading" className={styles.page}>
      <header className={styles.heading}>
        <h1 id="bookmarks-heading">收藏</h1>
        <p>你收藏过的帖子。只有你自己看得到。</p>
      </header>

      {/*
        一句常驻的状态播报，不随状态切换挂载/卸载——live region 与它的文字
        同时插进 DOM 时，多数读屏根本不播。
      */}
      <p className={styles.hint} role="status">
        {loading || state.kind === "loading"
          ? "正在读取收藏……"
          : state.kind === "signedOut"
            ? "登录后可以查看你的收藏。"
            : state.kind === "failed"
              ? "收藏暂时取不到。"
              : state.posts.length === 0
                ? "还没有收藏。在任意帖子上点「收藏」把它存下来。"
                : `共 ${state.posts.length} 条收藏。`}
      </p>

      {state.kind === "signedOut" ? (
        <p className={styles.hint}>
          <Link href="/login">去登录</Link>
        </p>
      ) : null}

      {state.kind === "ready" && state.posts.length > 0 ? (
        <ul className={styles.postList}>
          {state.posts.map((post) => (
            <li className={styles.postRow} key={post.id}>
              <Link href={post.href}>{post.title}</Link>
              <p>{post.body}</p>
              <small>{post.publishedLabel}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
