"use client";

import { useCallback, useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";

/*
 * 创作者中心的数据。
 *
 * 一处取、多页用。各页各自去问的话，草稿箱显示的条数和内容管理显示的条数
 * 会来自两个时刻——两个数各自都对，凑在一起对不上。
 */

export type StudioPost = Readonly<{
  body: string;
  created_at: string;
  id: string;
  kind: "article" | "discussion";
  status: "draft" | "published";
  title: string;
  updated_at: string;
  views: number;
}>;

export type StudioStats = Readonly<{
  bookmarkCount: number;
  commentCount: number;
  likeCount: number;
  publishedCount: number;
  totalViews: number;
  viewsByDate: Readonly<Record<string, number>>;
}>;

export type StudioData = Readonly<{
  followerCount: number;
  posts: readonly StudioPost[];
  stats: StudioStats;
}>;

type State =
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ data: StudioData; kind: "ready" }>;

export function useStudioData(): Readonly<{
  reload: () => void;
  state: State;
}> {
  const { account, authorizedFetch } = useAccountSession();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    /*
     * 未登录时什么都不做，也不在这里改状态：「没登录」是从 account 直接
     * 看得出来的，存一份只会多触发一轮渲染，而且那一份迟早和会话不同步。
     * 返回值那里按 account 推导。
     */
    if (account === null) return undefined;

    let cancelled = false;
    void (async () => {
      /*
       * 进「读取中」放在异步体的第一句，而不是 effect 的同步部分：
       * 同步改状态会在同一轮里再触发一次渲染。放这里对用户没有分别——
       * 它和紧随其后的请求属于同一件事。
       */
      setState({ kind: "loading" });
      try {
        const response = await authorizedFetch("/api/social/studio");
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as StudioData;
        if (!cancelled) setState({ data, kind: "ready" });
      } catch {
        /* 取不到就说取不到，不要拿空数据冒充「你还没写过东西」。 */
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch, nonce]);

  /* 「没登录」由 account 推导，不进 state——两处各存一份迟早会不一致。 */
  return { reload, state: account === null ? { kind: "anonymous" } : state };
}
