"use client";

import { useEffect, useState } from "react";

import styles from "./composer-toolbar.module.css";
import { composerEmoji } from "./emoji";
import { useAccountSession } from "../account/account-session";

/*
 * 工具栏各个面板的内容。
 *
 * 四个面板的数据全是真的：@ 用会话里已经有的账号表，# 拉话题接口，
 * $ 走站内的证券代码搜索，表情是一份写死的常用字符。
 *
 * 每个面板都要能说出「取不到」——回一份空列表，用户会读成「站里没有这个
 * 话题 / 这只股票」，那和「接口挂了」是完全不同的两件事。
 */

export function EmojiPicker({
  onPick,
}: Readonly<{ onPick: (text: string) => void }>) {
  return (
    <div aria-label="表情" className={styles.emojiGrid} role="group">
      {composerEmoji.map((emoji) => (
        <button
          className={styles.emoji}
          key={emoji}
          onClick={() => {
            onPick(emoji);
          }}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function MentionPicker({
  onPick,
}: Readonly<{ onPick: (displayName: string) => void }>) {
  const { account, accounts } = useAccountSession();
  const [query, setQuery] = useState("");

  /* 自己不出现在列表里：@ 自己没有意义，只会占掉一行。 */
  const rows = accounts
    .filter((row) => row.id !== account?.id)
    .filter((row) => row.displayName.includes(query.trim()))
    .slice(0, 8);

  return (
    <div className={styles.panelBody}>
      <input
        aria-label="搜索要提到的人"
        className={styles.search}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="搜索昵称"
        value={query}
      />
      {rows.length === 0 ? (
        <p className={styles.panelEmpty}>没有匹配的人。</p>
      ) : (
        <ul className={styles.panelList}>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                className={styles.panelRow}
                onClick={() => {
                  onPick(row.displayName);
                }}
                type="button"
              >
                <span>{row.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Load<T> =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; rows: readonly T[] }>;

export function TopicPicker({
  onPick,
}: Readonly<{ onPick: (tag: string) => void }>) {
  const [state, setState] = useState<Load<string>>({ kind: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/social/topics");
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as { topics?: readonly string[] };
        if (alive) setState({ kind: "ready", rows: data.topics ?? [] });
      } catch {
        /* 说「取不到」，不要回一份空列表冒充「站里没有话题」。 */
        if (alive) setState({ kind: "failed" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind !== "ready") {
    return (
      <p className={styles.panelEmpty}>
        {state.kind === "loading" ? "正在读取话题……" : "话题暂时取不到。"}
      </p>
    );
  }

  const rows = state.rows
    .filter((tag) => tag.includes(query.trim()))
    .slice(0, 10);

  return (
    <div className={styles.panelBody}>
      <input
        aria-label="搜索话题"
        className={styles.search}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="搜索话题"
        value={query}
      />
      {rows.length === 0 ? (
        <p className={styles.panelEmpty}>没有这个话题。</p>
      ) : (
        <ul className={styles.panelList}>
          {rows.map((tag) => (
            <li key={tag}>
              <button
                className={styles.panelRow}
                onClick={() => {
                  onPick(tag);
                }}
                type="button"
              >
                <span>#{tag}#</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Hit = Readonly<{ name: string; symbol: string | null }>;

export function StockPicker({
  onPick,
}: Readonly<{ onPick: (name: string, symbol: string) => void }>) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<Load<Hit>>({ kind: "ready", rows: [] });

  useEffect(() => {
    const trimmed = query.trim();
    /*
     * 空查询直接不发请求，也不在这里改状态。
     *
     * 「没输入时列表是空的」是从查询词推得出来的，不必存一份——
     * 在 effect 里同步 setState 会多触发一轮渲染，而且那一份状态和
     * 输入框迟早会不同步。
     */
    if (trimmed.length === 0) return undefined;

    let alive = true;
    /* 敲一个字发一次请求会把上游打满；停手 250ms 再查。 */
    const timer = setTimeout(() => {
      setState({ kind: "loading" });
      void (async () => {
        try {
          const response = await fetch(
            `/api/market/search?q=${encodeURIComponent(trimmed)}`,
          );
          if (!response.ok) throw new Error("failed");
          const data = (await response.json()) as { hits?: readonly Hit[] };
          if (alive) setState({ kind: "ready", rows: data.hits ?? [] });
        } catch {
          if (alive) setState({ kind: "failed" });
        }
      })();
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  /* 站内渲染不出来的标的（symbol 为 null）不给选：插进去也是条死链。 */
  const rows =
    state.kind === "ready" && trimmed.length > 0
      ? state.rows.filter((hit) => hit.symbol !== null).slice(0, 8)
      : [];

  return (
    <div className={styles.panelBody}>
      <input
        aria-label="搜索股票"
        className={styles.search}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="代码、名称或拼音首字母"
        value={query}
      />
      {trimmed.length > 0 && state.kind === "loading" ? (
        <p className={styles.panelEmpty}>搜索中……</p>
      ) : null}
      {trimmed.length > 0 && state.kind === "failed" ? (
        <p className={styles.panelEmpty}>搜索暂时用不了。</p>
      ) : null}
      {trimmed.length > 0 && state.kind === "ready" && rows.length === 0 ? (
        <p className={styles.panelEmpty}>没有找到这只标的。</p>
      ) : null}
      {rows.length === 0 ? null : (
        <ul className={styles.panelList}>
          {rows.map((hit) => (
            <li key={hit.symbol}>
              <button
                className={styles.panelRow}
                onClick={() => {
                  onPick(hit.name, hit.symbol ?? "");
                }}
                type="button"
              >
                <span>{hit.name}</span>
                <small>{hit.symbol?.toUpperCase()}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
