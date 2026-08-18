"use client";

import { useEffect, useState } from "react";

import styles from "./real-finance.module.css";

/*
 * 7×24 快讯。
 *
 * 这一页原先只有下面那份 SEC EDGAR 申报快照——真数据，但它是本地快照：
 * 最新一条停在两天前，页面上老实标着「已陈旧」。一个叫 7×24 的栏目，
 * 内容两天没动过。
 *
 * 这一块补上真正分钟级的中文市场快讯。下面那份申报记录保留，它是另一回事：
 * 官方申报原件，比快讯权威，只是更新得慢。
 */

/** 自动刷新间隔。 */
const REFRESH_MS = 60_000;

type NewsItem = Readonly<{
  digest: string | null;
  href: string;
  id: string;
  publishedAt: string | null;
  title: string;
}>;

type State =
  | Readonly<{ items: readonly NewsItem[]; kind: "ready" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>;

/* 频道间切换不重复空等；只缓存本会话取到的真实快讯。 */
let newsCache: readonly NewsItem[] | null = null;

/**
 * 只取数、不碰状态。
 *
 * 请求被取消时回 null，让调用方原地不动——把中断当成失败会让页面在切走的
 * 一瞬间闪一下「取不到」。
 */
const fetchNews = async (signal: AbortSignal): Promise<State | null> => {
  try {
    const response = await fetch("/api/live-news", { signal });
    if (signal.aborted) return null;
    if (!response.ok) return { kind: "failed" };
    const data = (await response.json()) as { items?: readonly NewsItem[] };
    if (signal.aborted) return null;
    const items = data.items ?? [];
    newsCache = items;
    return { items, kind: "ready" };
  } catch {
    return signal.aborted ? null : { kind: "failed" };
  }
};

export function LiveNewsFeed() {
  const [state, setState] = useState<State>(() =>
    newsCache === null
      ? { kind: "loading" }
      : { items: newsCache, kind: "ready" },
  );
  const [pending, setPending] = useState(newsCache === null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    /*
     * 取数做成不碰状态的纯函数（见 fetchNews），状态更新留在这里——
     * 因此一定发生在 await 之后，不会在同一轮渲染里再触发一次。
     */
    const refresh = async (): Promise<void> => {
      setPending(true);
      const next = await fetchNews(controller.signal);
      if (next !== null) {
        setState((current) =>
          next.kind === "failed" && current.kind === "ready" ? current : next,
        );
        setPending(false);
      }
    };

    void refresh();

    const timer = setInterval(() => {
      // 暂停了就不刷。列表每分钟整体重绘，正在逐条读的读屏用户和
      // 用放大镜的人会一直丢失阅读位置——WCAG 2.2.2 是 A 级要求。
      if (paused) return;
      // 后台标签页不刷新：省下的那次请求换不来任何人看得见的东西。
      if (globalThis.document?.visibilityState === "hidden") return;
      void refresh();
    }, REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [paused]);

  return (
    <section
      aria-busy={pending}
      aria-labelledby="live-news-heading"
      className={styles.sectionPanel}
    >
      <div className={styles.sectionHeading}>
        <h2 id="live-news-heading">实时快讯</h2>
        <span className={styles.muted}>东方财富公开快讯 · 北京时间</span>
        <button
          aria-pressed={paused}
          className={styles.refreshToggle}
          onClick={() => setPaused((current) => !current)}
          type="button"
        >
          <span aria-hidden="true" className={styles.refreshDot} />
          {paused ? "已暂停" : "自动刷新中"}
        </button>
      </div>

      {/*
        一句常驻的状态播报，不随状态切换挂载/卸载——live region 与它的文字
        同时插进 DOM 时，多数读屏根本不播。
      */}
      <p className={styles.status} role="status">
        {pending && state.kind === "ready"
          ? "正在后台更新快讯……"
          : state.kind === "loading"
            ? "正在读取快讯……"
            : state.kind === "failed"
              ? "快讯暂时取不到。本页不以样本内容代替。"
              : state.items.length === 0
                ? "暂无快讯。"
                : `已列出 ${state.items.length} 条快讯。`}
      </p>

      {state.kind === "ready" && state.items.length > 0 ? (
        <ol className={styles.timelineList}>
          {state.items.map((item) => (
            <li key={item.id}>
              <div className={styles.timelineMeta}>
                <time>{item.publishedAt ?? "—"}</time>
              </div>
              {/*
                点出去是源站原文。本站不转存快讯正文，只列标题与摘要。
              */}
              <a
                className={styles.recordLink}
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {item.title}
                {/* 按下之前就该知道这会跳出站、并且新开窗口。 */}
                <span className="visually-hidden">
                  （东方财富，新窗口打开）
                </span>
              </a>
              {item.digest === null ? null : (
                <p className={styles.publisher}>{item.digest}</p>
              )}
            </li>
          ))}
        </ol>
      ) : state.kind === "loading" ? (
        <ol
          aria-hidden="true"
          className={`${styles.timelineList} ${styles.timelineSkeleton}`}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <span />
              <span />
              <span />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
