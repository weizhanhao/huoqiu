"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./channels.module.css";

/*
 * 视频频道。
 *
 * 这一页此前六条全是编的：「圆桌：哪些笔记值得长期保留 · 离线影像间 ·
 * 1.9 万次播放 · 5:42」——标题、作者、时长、播放量没有一样是真的，
 * 封面是本地渐变，连主题分类（复盘 / 方法 / 数据 / 访谈）也是我自己想的。
 * 每一条的链接都指向 /videos#<id>，一个不存在的锚点。
 *
 * 现在列的是东方财富公开视频列表里的真实条目，栏目用它自己的四个，
 * 点开是它自己的播放页。
 *
 * 三样东西没有了，因为上游没有：时长、播放量、作者。编不出来就不显示——
 * 一个假的播放量比没有播放量糟得多。
 */

/** 封面原图尺寸，写死在文件名里（_w210h154）。 */
const THUMBNAIL_WIDTH = 210;
const THUMBNAIL_HEIGHT = 154;

type Video = Readonly<{
  code: string;
  column: string | null;
  href: string;
  publishedAt: string | null;
  thumbnail: string | null;
  title: string;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; videos: readonly Video[] }>;

const NO_VIDEOS: readonly Video[] = [];

export function VideosHub() {
  const [column, setColumn] = useState("");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/videos");
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as { videos?: readonly Video[] };
        if (cancelled) return;
        setState({ kind: "ready", videos: data.videos ?? [] });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * 空数组用模块级常量：每次渲染新建一个会让下面的 useMemo 每帧重算，
   * 而它算出来的栏目列表又是按钮的渲染依据。
   */
  const all = state.kind === "ready" ? state.videos : NO_VIDEOS;

  /*
   * 栏目按钮由取回来的这批视频自己决定，不写死一份清单：上游哪天改了栏目，
   * 这里会跟着变，而不是留下一个永远筛不出东西的按钮。
   */
  const columns = useMemo(() => {
    const seen: string[] = [];
    for (const video of all) {
      if (video.column !== null && !seen.includes(video.column)) {
        seen.push(video.column);
      }
    }
    return seen;
  }, [all]);

  const shown =
    column.length === 0 ? all : all.filter((video) => video.column === column);

  const columnFilters: readonly (readonly [string, string])[] = [
    ["", "全部"],
    ...columns.map((name) => [name, name] as const),
  ];

  return (
    <section
      aria-labelledby="videos-heading"
      className={styles.page}
      data-testid="videos-hub"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>视频</p>
          <h1 id="videos-heading">视频</h1>
        </div>
        <p className={styles.heroNote}>
          东方财富公开视频列表的最近更新，点开在源站播放。
          本站不转存视频文件，也不提供上传与直播。
        </p>
      </header>

      {columns.length === 0 ? null : (
        <div aria-label="视频栏目" className={styles.filters} role="group">
          {columnFilters.map(([value, label]) => (
            <button
              aria-pressed={column === value}
              key={value === "" ? "all" : value}
              onClick={() => setColumn(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>{column.length === 0 ? "最近更新" : column}</h2>
          {/*
            说「本页 N 条」而不是「共 N 条」：这是取回来的最近一批，
            不是源站的全部。
          */}
          <span>
            {state.kind === "ready" ? `本页 ${shown.length} 条` : "正在读取"}
          </span>
        </div>

        {/*
          一句常驻的状态播报，不随状态切换挂载/卸载。
          原先三段各自渲染一个 live region，容器和文字同时插进 DOM——多数
          读屏对这种情况根本不播，于是切栏目之后一片沉默。成功也要出声。
        */}
        <p className={styles.empty} role="status">
          {state.kind === "loading"
            ? "正在读取视频列表……"
            : state.kind === "failed"
              ? "视频列表暂时取不到。本站不以占位内容代替。"
              : shown.length === 0
                ? "该栏目下暂无视频。"
                : `已列出 ${shown.length} 条视频。`}
        </p>

        {shown.length === 0 ? null : (
          <ul className={styles.rows}>
            {shown.map((video) => (
              <li key={video.code}>
                <a
                  className={styles.videoRow}
                  href={video.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {/*
                    封面经本站转发，浏览器不直连第三方——与顶栏搜索同一条
                    边界。宽高写死，避免图片加载完把下面的内容顶下去。
                  */}
                  {video.thumbnail === null ? (
                    <span aria-hidden="true" className={styles.thumbnail} />
                  ) : (
                    <img
                      alt=""
                      className={styles.cover}
                      height={THUMBNAIL_HEIGHT}
                      loading="lazy"
                      src={`/api/videos/thumbnail?name=${encodeURIComponent(video.thumbnail)}`}
                      width={THUMBNAIL_WIDTH}
                    />
                  )}
                  <span className={styles.videoBody}>
                    <strong>
                      {video.title}
                      {/* 按下之前就该知道这会跳出站、并且新开窗口。 */}
                      <span className="visually-hidden">
                        （东方财富，新窗口打开）
                      </span>
                    </strong>
                    <span className={styles.videoMeta}>
                      {video.column === null ? null : (
                        <span>{video.column}</span>
                      )}
                      {video.publishedAt === null ? null : (
                        <span>{video.publishedAt}</span>
                      )}
                      <span>东方财富 · 站外播放</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-label="受限能力说明" className={styles.restricted}>
        <strong>仅列表与跳转</strong>
        {/*
          这里原先挂着一个 disabled 的「投稿暂未开放」按钮。一个永远按不动的
          按钮不是能力说明，是个摆设——说明写成话就够了。
        */}
        <span>
          本站不转存视频文件，不提供上传、直播或站内播放；时长与播放量源站
          未公开，因此不显示。
        </span>
      </aside>
    </section>
  );
}
