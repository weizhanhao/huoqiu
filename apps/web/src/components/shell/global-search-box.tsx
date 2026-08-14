"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  readBrowserStore,
  useBrowserStore,
  writeBrowserStore,
} from "../../lib/browser-store";

/*
 * 顶栏搜索。
 *
 * 之前这里是一个原生 <form action="/search">：输入过程中没有任何反馈，
 * 必须敲回车整页跳转才知道有没有结果。
 *
 * 建议此前是在 35 个虚构标的里做本地过滤——搜「茅台」一条也搜不到，
 * 搜「星海智造」倒是有。一个只能搜到不存在的东西的搜索框。现在打的是
 * 真实的证券代码表，支持代码、名称与拼音首字母。
 *
 * 三条原则保留：
 *   1. 保留原生表单提交。禁用 JS 时它退化成原来的样子，仍然可用；
 *      建议面板是增强，不是前提。
 *   2. 面板绝对定位、不参与文档流。展开收起不会推动页面任何元素——
 *      一个每次输入都把页面顶一下的搜索框，比没有建议更糟。
 *   3. 输入只发往本站接口，由服务端代为查询，浏览器不直连第三方。
 */

const HISTORY_KEY = "huoqiu.search-history.v1";
const MAX_HISTORY = 8;
/** 热门搜索列几条。 */
const HOT_ROWS = 6;

/*
 * 敲字到发请求之间的等待。
 *
 * 没有它的话，「贵州茅台」四个字会打出四次请求，而前三次的结果都已经
 * 过时——回来得晚的那一个还会把正确结果覆盖掉。
 */
const DEBOUNCE_MS = 220;

type SearchHit = Readonly<{
  code: string;
  href: string | null;
  kind: string;
  name: string;
}>;

type HotRow = Readonly<{
  changePercent: number | null;
  code: string;
  href: string | null;
  name: string;
}>;

type Suggestions =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ hits: readonly SearchHit[]; kind: "ready" }>;

/* 模块级常量：每次返回一个新数组会让存储快照的比对判定为「变了」。 */
const NO_HISTORY: readonly string[] = [];

const parseHistory = (raw: string | null): readonly string[] => {
  if (raw === null) return NO_HISTORY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : NO_HISTORY;
  } catch {
    return NO_HISTORY;
  }
};

const rememberQuery = (query: string): void => {
  const trimmed = query.trim();
  if (trimmed.length === 0) return;
  const current = parseHistory(readBrowserStore(HISTORY_KEY));
  const next = [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(
    0,
    MAX_HISTORY,
  );
  writeBrowserStore(HISTORY_KEY, JSON.stringify(next));
};

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

/* 模块级常量：每次渲染新建对象会让依赖它的记忆化失效。 */
const IDLE_SUGGESTIONS: Suggestions = { kind: "idle" };

export function GlobalSearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /*
   * 历史直接订阅存储，不再「先渲染成空、挂载后读一次再 setState」——
   * 那样搜过东西的人点开搜索框会看见历史闪一下才出现。
   */
  const history = useBrowserStore(HISTORY_KEY, parseHistory, NO_HISTORY);
  const [hot, setHot] = useState<readonly HotRow[]>([]);
  const [loadedSuggestions, setSuggestions] = useState<Suggestions>({
    kind: "idle",
  });
  /** 方向键选中的那一条；-1 表示还在输入框上。 */
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  /* 热门搜索取当日真实涨幅榜前几名。 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/market/hot?market=cn&direction=gainers&rows=${HOT_ROWS}`,
        );
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { rows?: readonly HotRow[] };
        if (!cancelled) setHot(data.rows ?? []);
      } catch {
        // 热门取不到就不显示这一块，搜索本身照常可用。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 空输入就是没有建议——不必等 effect 去改一次状态。 */
  const suggestions: Suggestions =
    query.trim().length === 0 ? IDLE_SUGGESTIONS : loadedSuggestions;

  /* 输入建议。防抖 + 取消，避免旧结果盖掉新结果。 */
  useEffect(() => {
    const needle = query.trim();
    /*
     * 没输入就不查，也不在这里改状态：「空输入等于没有建议」看 query 就够了
     * （见下面 suggestions 的推导）。存一份就要负责同步，而它和输入框迟早
     * 会错开一帧。
     */
    if (needle.length === 0) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      setSuggestions({ kind: "loading" });
      void (async () => {
        try {
          const response = await fetch(
            `/api/market/search?q=${encodeURIComponent(needle)}`,
          );
          if (cancelled) return;
          if (!response.ok) {
            setSuggestions({ kind: "failed" });
            return;
          }
          const data = (await response.json()) as {
            hits?: readonly SearchHit[];
          };
          if (cancelled) return;
          setSuggestions({ hits: data.hits ?? [], kind: "ready" });
        } catch {
          if (!cancelled) setSuggestions({ kind: "failed" });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // 点击面板之外收起。用 pointerdown 而不是 click，避免与链接跳转竞争。
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    globalThis.addEventListener("pointerdown", onPointerDown);
    return () => {
      globalThis.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const showHistory = query.trim().length === 0;
  const hasPanel =
    open && (showHistory ? history.length > 0 || hot.length > 0 : true);

  /*
   * 键盘可选的那一列。
   *
   * 此前面板挂着 role="listbox" 却一个 option 都没有：读屏被告知弹出了
   * 一个列表，然后读不到任何东西；方向键也完全不工作，要够到第一条建议
   * 得先 Tab 过「搜索」按钮。
   */
  const options =
    showHistory || suggestions.kind !== "ready" ? [] : suggestions.hits;
  const activeId =
    active >= 0 && active < options.length
      ? `global-search-option-${String(active)}`
      : undefined;

  return (
    <div className="global-search-shell" ref={containerRef}>
      <form
        action="/search"
        className="global-search"
        method="get"
        onSubmit={() => {
          rememberQuery(query);
        }}
      >
        <label className="visually-hidden" htmlFor="global-search-query">
          搜索标的
        </label>
        <input
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-controls="global-search-listbox"
          aria-expanded={hasPanel}
          autoComplete="off"
          id="global-search-query"
          name="q"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActive((current) => (current + 1) % options.length);
              return;
            }
            if (event.key === "ArrowUp" && options.length > 0) {
              event.preventDefault();
              setActive((current) =>
                current <= 0 ? options.length - 1 : current - 1,
              );
              return;
            }
            if (event.key === "Enter" && activeId !== undefined) {
              const hit = options[active];
              if (hit?.href != null && hit.href.length > 0) {
                event.preventDefault();
                setOpen(false);
                /*
                 * 用原生跳转，不用 useRouter。
                 *
                 * 这个搜索框在顶栏里、出现在每一页，而 useRouter 在 app
                 * router 之外会直接抛——所有用 renderToStaticMarkup 渲染页面的
                 * 测试会全线红，浏览器 harness 也一样。为一个回车跳转
                 * 换来这种脆弱不值得。
                 */
                globalThis.location.assign(hit.href);
              }
              return;
            }
            if (event.key === "Escape") {
              /*
               * Esc 只收面板，不清输入。
               *
               * 浏览器对 <input type="search"> 有原生的「按 Esc 清空」行为，
               * 清空又会触发 onChange 把面板重新打开——于是按一次 Esc 的效果
               * 是「输入没了、面板还在」，按两次才关得掉。preventDefault
               * 挡住那个原生行为。
               */
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            }
          }}
          placeholder="搜索代码、名称或拼音首字母"
          role="combobox"
          type="search"
          value={query}
        />
        <button type="submit">搜索</button>
      </form>

      {hasPanel ? (
        <div
          aria-label="搜索建议"
          className="search-suggest"
          id="global-search-listbox"
          /*
           * 只有在真的列出 option 时才声明 listbox。
           * 历史与热门那一屏是普通的链接列表，硬挂 listbox 会让读屏去找
           * option 而一个都找不到——那正是这里此前的毛病。
           */
          role={options.length > 0 ? "listbox" : "group"}
        >
          {showHistory ? (
            <>
              {history.length === 0 ? null : (
                <section>
                  <div className="search-suggest-heading">
                    <span className="search-suggest-label">搜索历史</span>
                    <button
                      onClick={() => {
                        writeBrowserStore(HISTORY_KEY, null);
                      }}
                      type="button"
                    >
                      清空
                    </button>
                  </div>
                  <div className="search-suggest-chips">
                    {history.map((entry) => (
                      <Link
                        href={`/search?q=${encodeURIComponent(entry)}`}
                        key={entry}
                        onClick={() => setOpen(false)}
                      >
                        {entry}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {hot.length === 0 ? null : (
                <section>
                  <div className="search-suggest-heading">
                    <span className="search-suggest-label">热门搜索</span>
                    <span>当日涨幅榜</span>
                  </div>
                  <ul>
                    {hot.map((row) => (
                      <li key={row.code}>
                        {/*
                          站内渲染不出来的代码不给链接：先许诺点得进去、
                          再给一张空页，比不给链接更糟。
                        */}
                        {row.href === null ? (
                          <span>
                            <strong>{row.name}</strong>
                            <span>
                              {row.code} · {formatPercent(row.changePercent)}
                            </span>
                          </span>
                        ) : (
                          <Link href={row.href} onClick={() => setOpen(false)}>
                            <strong>{row.name}</strong>
                            <span>
                              {row.code} · {formatPercent(row.changePercent)}
                            </span>
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : suggestions.kind === "loading" ? (
            <p className="search-suggest-empty">正在搜索……</p>
          ) : suggestions.kind === "failed" ? (
            /*
             * 「搜索用不了」和「没有这只股票」要分开说。
             * 混为一谈会让人以为自己记错了代码。
             */
            <p className="search-suggest-empty">
              搜索暂时用不了。按回车仍可打开搜索页。
            </p>
          ) : suggestions.kind === "ready" && suggestions.hits.length === 0 ? (
            <p className="search-suggest-empty">
              没有匹配的标的。按回车可以搜索帖子与达人。
            </p>
          ) : suggestions.kind === "ready" ? (
            <ul>
              {suggestions.hits.map((hit, index) => (
                <li
                  aria-selected={index === active}
                  className={index === active ? "search-suggest-active" : ""}
                  id={`global-search-option-${String(index)}`}
                  key={`${hit.code}-${hit.kind}`}
                  role="option"
                >
                  {hit.href === null ? (
                    <span>
                      <strong>{hit.name}</strong>
                      <span>
                        {hit.code}
                        {hit.kind === "" ? "" : ` · ${hit.kind}`} · 站内暂无页面
                      </span>
                    </span>
                  ) : (
                    <Link href={hit.href} onClick={() => setOpen(false)}>
                      <strong>{hit.name}</strong>
                      <span>
                        {hit.code}
                        {hit.kind === "" ? "" : ` · ${hit.kind}`}
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
