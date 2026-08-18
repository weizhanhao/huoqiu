"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * 右栏「社区热榜」。
 *
 * 这一块此前排的是十条写死的合成帖子（post_syn_…），标题和互动量都是编的，
 * 而站内真实发出来的帖子一条也上不了榜。现在按真实点赞数排真实帖子。
 *
 * 客户端取数，和另外两块 rail 一样：整站外壳会被浏览器测试直接渲染，
 * 在它里面 import 服务端的存储模块，会把 node:fs 一起打进浏览器包。
 */

type HotPost = Readonly<{ id: string; likeCount: number; title: string }>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; posts: readonly HotPost[] }>;

let hotPostsCache: readonly HotPost[] | null = null;
let hotPostsRequest: Promise<readonly HotPost[]> | null = null;

const loadHotPosts = async (): Promise<readonly HotPost[]> => {
  if (hotPostsCache !== null) return hotPostsCache;
  hotPostsRequest ??= (async () => {
    const response = await fetch("/api/social/posts/hot");
    if (!response.ok) throw new Error("hot posts unavailable");
    const data = (await response.json()) as { posts?: readonly HotPost[] };
    hotPostsCache = data.posts ?? [];
    return hotPostsCache;
  })().finally(() => {
    hotPostsRequest = null;
  });
  return hotPostsRequest;
};

export function RailHotPosts() {
  const [state, setState] = useState<State>(() =>
    hotPostsCache === null
      ? { kind: "loading" }
      : { kind: "ready", posts: hotPostsCache },
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const posts = await loadHotPosts();
        if (cancelled) return;
        setState({ kind: "ready", posts });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rail-card">
      <div className="rail-heading">
        <h2>社区热榜</h2>
        <span>按点赞数</span>
      </div>

      {state.kind === "loading" ? (
        <p aria-live="polite" className="rail-empty">
          正在读取热榜……
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <p className="rail-empty">热榜暂时取不到。</p>
      ) : null}

      {state.kind === "ready" && state.posts.length === 0 ? (
        // 说清楚是还没有人发过，而不是留一块空白让人以为没加载出来。
        <p className="rail-empty">还没有人发过帖子。</p>
      ) : null}

      {state.kind === "ready" && state.posts.length > 0 ? (
        <ol className="hot-list">
          {state.posts.map((post, index) => (
            <li key={post.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Link href={`/community/posts/${post.id}`}>
                {/*
                  标题为空时给一句话，不给一个没有名字的链接。
                  真实数据里确实有标题为空的帖子，读屏会念成「链接」，
                  用户既不知道它去哪，也没法在列表里定位它。
                */}
                <strong>
                  {post.title.trim() === "" ? "无标题" : post.title}
                </strong>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
