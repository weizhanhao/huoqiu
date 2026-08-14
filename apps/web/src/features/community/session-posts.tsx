"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createSyntheticCommunityCard,
  type FeedCard,
} from "./community-content-model";
import type { CommunityChannel, PublisherMode } from "./community-state";

/*
 * 本次会话发布的帖子。
 *
 * 发布器和社区信息流在不同路由上，组件内的 useState 跨不过导航，
 * 所以状态必须提到 layout 层——和 D0WatchlistProvider / NotificationSessionProvider /
 * ProfileSessionProvider 三个既有会话态是同一套做法。
 *
 * 只存在内存里：刷新即清空，不上传、不落盘。这既是 D0 的既定边界，
 * 也让「仅本次会话」这句话对用户是真的。
 */

type SessionPostInput = Readonly<{
  body: string;
  mode: PublisherMode;
  title: string;
}>;

type SessionPostsValue = Readonly<{
  posts: readonly FeedCard[];
  publish: (input: SessionPostInput) => FeedCard;
}>;

const SessionPostsContext = createContext<SessionPostsValue | null>(null);

/** 会话内发布的帖子统一挂在这个作者名下，与固定合成作者区分开。 */
const SESSION_AUTHOR = "演示用户";
const SESSION_AUTHOR_ID = "user_demo_0001";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * 发布时刻的展示标签。
 *
 * 用发布那一刻的真实时间，而不是固定串——否则连续发两条会显示同一时间，
 * 用户会以为没发出去。
 */
const publishedLabelAt = (moment: Date): string =>
  `今天 ${twoDigits(moment.getHours())}:${twoDigits(moment.getMinutes())}`;

export function SessionPostsProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [posts, setPosts] = useState<readonly FeedCard[]>([]);

  const publish = useCallback(
    ({ body, mode, title }: SessionPostInput): FeedCard => {
      const isArticle = mode === "article";
      // 序号用长度递增而非随机数：D0 禁止不可复现的输出。
      const sequence = posts.length + 1;
      const channel: CommunityChannel = "关注";
      const card = createSyntheticCommunityCard({
        author: SESSION_AUTHOR,
        authorId: SESSION_AUTHOR_ID,
        body: body.trim(),
        // 新帖进「关注」频道，与发布者自己的身份一致。
        channel,
        engagement: { comments: 0, likes: 0, reposts: 0, views: 0 },
        id: `post_session_${twoDigits(sequence)}`,
        kind: isArticle ? "长文摘要" : "帖子",
        meta: "本次会话发布",
        publishedLabel: publishedLabelAt(new Date()),
        tags: ["#本次会话"],
        title: isArticle ? title.trim() : body.trim().slice(0, 24),
        ...(isArticle ? { readTime: "1 分钟阅读" } : {}),
      });

      setPosts((current) => [card, ...current]);
      return card;
    },
    [posts.length],
  );

  const value = useMemo<SessionPostsValue>(
    () => ({ posts, publish }),
    [posts, publish],
  );

  return (
    <SessionPostsContext.Provider value={value}>
      {children}
    </SessionPostsContext.Provider>
  );
}

/**
 * Provider 缺失时返回空实现而不是抛错。
 *
 * 发布器与信息流会被独立的测试 harness 单独挂载，
 * 强制要求 Provider 会把那些用例全部拖垮，而它们本来就不测会话发布。
 */
export function useSessionPosts(): SessionPostsValue {
  const value = useContext(SessionPostsContext);
  return (
    value ?? {
      posts: [],
      publish: () => {
        throw new Error("SESSION_POSTS_PROVIDER_MISSING");
      },
    }
  );
}
