"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./real-finance.module.css";

/*
 * 全市场公告。
 *
 * 这一块顶掉的是原先那份 SEC EDGAR 美股申报快照：数据是真的，但它靠一个
 * 需要 SEC 可联系身份的脚本刷新，最新一条常常停在两天前；而且这是雪球
 * 复刻站，A 股站的「官方申报」列美股申报本身就不对题。
 *
 * 巨潮是证监会指定的信息披露网站，公告是原件 PDF，接口不需要任何身份。
 */

/** 自动刷新间隔。公告不像快讯那么密，两分钟够了。 */
const REFRESH_MS = 120_000;

type Announcement = Readonly<{
  code: string;
  href: string;
  name: string;
  publishedOn: string | null;
  symbolHref: string | null;
  title: string;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      kind: "ready";
      rows: readonly Announcement[];
      total: number | null;
    }>;

/**
 * 只取数、不碰状态。
 *
 * 请求被取消时回 null，让调用方原地不动——把中断当成失败会让页面在切走的
 * 一瞬间闪一下「取不到」。
 */
const fetchAnnouncements = async (
  signal: AbortSignal,
): Promise<State | null> => {
  try {
    const response = await fetch("/api/market/announcements", { signal });
    if (signal.aborted) return null;
    if (!response.ok) return { kind: "failed" };
    const data = (await response.json()) as {
      rows?: readonly Announcement[];
      total?: number | null;
    };
    if (signal.aborted) return null;
    return {
      kind: "ready",
      rows: data.rows ?? [],
      total: data.total ?? null,
    };
  } catch {
    return signal.aborted ? null : { kind: "failed" };
  }
};

export function MarketAnnouncementsFeed() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    /*
     * 取数做成不碰状态的纯函数（见 fetchAnnouncements），状态更新留在这里——
     * 因此一定发生在 await 之后，不会在同一轮渲染里再触发一次。
     */
    const refresh = async (): Promise<void> => {
      const next = await fetchAnnouncements(controller.signal);
      if (next !== null) setState(next);
    };

    void refresh();

    const timer = setInterval(() => {
      // 后台标签页不刷新。
      if (globalThis.document?.visibilityState === "hidden") return;
      void refresh();
    }, REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return (
    <section
      aria-labelledby="announcements-heading"
      className={styles.sectionPanel}
    >
      <div className={styles.sectionHeading}>
        <h2 id="announcements-heading">上市公司公告</h2>
        <span className={styles.muted}>
          巨潮资讯 · 法定披露原件 · 每两分钟刷新
        </span>
      </div>

      {/* 一句常驻的状态播报；live region 与文字同时插进 DOM 时读屏多半不播。 */}
      <p className={styles.status} role="status">
        {state.kind === "loading"
          ? "正在读取公告……"
          : state.kind === "failed"
            ? "公告暂时取不到。本页不以样本内容代替。"
            : state.rows.length === 0
              ? "暂无公告。"
              : `已列出 ${state.rows.length} 条公告。`}
      </p>

      {state.kind === "ready" && state.rows.length > 0 ? (
        <ol className={styles.timelineList}>
          {state.rows.map((row) => (
            <li key={`${row.code}-${row.href}`}>
              <div className={styles.timelineMeta}>
                <time>{row.publishedOn ?? "—"}</time>
                {/*
                  站内渲染不出来的代码不给链接：北交所的票也会出现在公告里，
                  照样给链接的话点进去是空页。
                */}
                {row.symbolHref === null ? (
                  <span>
                    {row.name} {row.code}
                  </span>
                ) : (
                  <Link href={row.symbolHref}>
                    {row.name} {row.code}
                  </Link>
                )}
              </div>
              {/* 点出去是巨潮上的公告原件 PDF，本站不转存。 */}
              <a
                className={styles.recordLink}
                href={row.href}
                rel="noreferrer"
                target="_blank"
              >
                {row.title}
                {/* 按下之前就该知道这会跳出站、开的是 PDF、并且新开窗口。 */}
                <span className="visually-hidden">
                  （巨潮资讯 PDF 原件，新窗口打开）
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
