"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountSession } from "./account-session";
import styles from "./account.module.css";

/*
 * 主页上「回复」和「收藏」两个页签——本人可见。
 *
 * 一个人收藏过什么，等于他在关注什么、在看什么，那是私事。
 *
 * 这两块刻意不由服务端渲染：服务端渲染出去的数据会躺在页面源码里，
 * 在组件里隐藏只是把它藏在视觉之外，查看源码照样读得到。所以这里在客户端
 * 带着令牌去取，服务端那一侧会核对「你要的是不是你自己的」。
 *
 * 因此这一段必然有一次加载：那是它安全的代价，不是没做完。
 */

type Reply = Readonly<{
  body: string;
  href: string;
  id: string;
  postTitle: string;
  publishedLabel: string;
}>;

type Bookmark = Readonly<{
  body: string;
  href: string;
  id: string;
  publishedLabel: string;
  title: string;
}>;

type LoadState =
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      bookmarks: readonly Bookmark[];
      kind: "ready";
      replies: readonly Reply[];
    }>;

export function LockedProfileTabs({ ownerId }: Readonly<{ ownerId: string }>) {
  const { account, authorizedFetch } = useAccountSession();
  /*
   * 初始状态是「上锁」，不是「加载中」。
   *
   * 服务端渲染时根本不知道来访的是谁——令牌在 localStorage 里。初始写
   * 「加载中」，访客首屏就会看到「正在读取**你自己的**回复与收藏……」：
   * 对一个不是本人的人说「你自己的」，还暗示数据马上会来，而它永远不会来。
   * 禁用 JS 的访客更是永远停在那句话上。
   *
   * 从上锁起步，两边都是对的：访客看到的是事实，本人多经过一次短暂的加载。
   */
  const [fetched, setFetched] = useState<LoadState>({ kind: "loading" });

  /*
   * 不是本人就不发请求。
   *
   * 明知会被拒还去打一次，除了给服务端添一次 403 之外没有任何用处，
   * 而且会让「上锁」这件事看起来像一次失败。
   */
  const isOwner = account !== null && account.id === ownerId;

  useEffect(() => {
    /*
     * 不是本人时这里什么都不做：「上锁」是从 isOwner 直接看得出来的，
     * 不必再存一份（见下面 state 的推导）。存了就要同步，而没跟上的那一刻
     * 页面会把本人也挡在外面。
     */
    if (!isOwner) return undefined;

    let cancelled = false;

    void (async () => {
      setFetched({ kind: "loading" });
      try {
        const response = await authorizedFetch(
          `/api/social/profile?account=${encodeURIComponent(ownerId)}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setFetched({ kind: "denied" });
          return;
        }
        const data = (await response.json()) as {
          bookmarks?: readonly Bookmark[];
          replies?: readonly Reply[];
        };
        if (cancelled) return;
        setFetched({
          bookmarks: data.bookmarks ?? [],
          kind: "ready",
          replies: data.replies ?? [],
        });
      } catch {
        if (!cancelled) setFetched({ kind: "failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isOwner, ownerId]);

  /* 不是本人就是上锁——这一条不必存，看 isOwner 就够了。 */
  const state: LoadState = isOwner ? fetched : { kind: "denied" };

  if (state.kind === "denied") {
    return (
      <section className={styles.card} data-testid="locked-profile-tabs">
        <div className={styles.heading}>
          <h2>回复与收藏</h2>
          <p>这两项仅本人可见。</p>
        </div>
        {/*
          说清楚是「只有本人能看」，不是「这个人没有回复和收藏」。
          后者会让访客对别人的活跃程度产生一个错误印象。
        */}
        <p className={styles.hint}>
          该账号的回复与收藏记录仅本人可见，因此这里不展示，也不显示数量。
        </p>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section className={styles.card} data-testid="locked-profile-tabs">
        <div className={styles.heading}>
          <h2>回复与收藏</h2>
        </div>
        <p aria-live="polite" className={styles.hint}>
          正在读取你自己的回复与收藏……
        </p>
      </section>
    );
  }

  if (state.kind === "failed") {
    return (
      <section className={styles.card} data-testid="locked-profile-tabs">
        <div className={styles.heading}>
          <h2>回复与收藏</h2>
        </div>
        <p className={styles.hint}>暂时读取不到，请稍后再试。</p>
      </section>
    );
  }

  return (
    <>
      <section className={styles.card} data-testid="locked-profile-tabs">
        <div className={styles.heading}>
          <h2>回复 {state.replies.length}</h2>
          <p>你在别人帖子下留下的评论，点标题回到原帖。仅你自己可见。</p>
        </div>
        {state.replies.length === 0 ? (
          <p className={styles.hint}>你还没有回复过内容。</p>
        ) : (
          <div className={styles.postList}>
            {state.replies.map((reply) => (
              <article className={styles.postRow} key={reply.id}>
                {/* 只放一句评论，读者不知道它在回应什么，所以带上原帖标题。 */}
                <Link href={reply.href}>回复《{reply.postTitle}》</Link>
                <p>{reply.body}</p>
                <small>{reply.publishedLabel}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <h2>收藏 {state.bookmarks.length}</h2>
          <p>你收藏的帖子。仅你自己可见。</p>
        </div>
        {state.bookmarks.length === 0 ? (
          <p className={styles.hint}>你还没有收藏过内容。</p>
        ) : (
          <div className={styles.postList}>
            {state.bookmarks.map((post) => (
              <article className={styles.postRow} key={post.id}>
                <Link href={post.href}>{post.title}</Link>
                <p>{post.body}</p>
                <small>{post.publishedLabel}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
