"use client";

import { ScrollableTable } from "../../components/system/scrollable-table";
import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./etf-center.module.css";

/*
 * ETF 中心。
 *
 * 这一页此前列的是九只虚构 ETF（etf_syn_0001…），代码、净值、规模全是编的；
 * 而站内其实早就能渲染真实 ETF 的行情与日线（/instruments/sh510300）——
 * 这一栏通向的内容全假，真的那一份反而没有入口。
 *
 * 现在列的是真实 ETF，每一行都通向它自己的标的页。排序和分页由上游做：
 * 只把本页重排，得到的是「这 20 只里的顺序」，却会被读成
 * 「全市场成交额最大的 20 只」。
 */

const SORTS = [
  { id: "amount", label: "成交额" },
  { id: "change", label: "涨幅" },
  { id: "volume", label: "成交量" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

/** 与取数层的一页条数对齐；不足一页就说明到底了。 */
const PAGE_SIZE = 20;

type EtfRow = Readonly<{
  amount: number | null;
  changePercent: number | null;
  code: string;
  href: string | null;
  last: number | null;
  name: string;
  volumeHands: number | null;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      delayed: boolean;
      kind: "ready";
      rows: readonly EtfRow[];
      total: number | null;
    }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(3);

/** 成交额按亿元显示；上游给的是元。 */
const formatAmount = (value: number | null): string =>
  value === null ? "—" : `${(value / 100_000_000).toFixed(2)} 亿`;

/** 成交量按万手显示；上游 f5 给的就是手，不是股。 */
const formatVolume = (value: number | null): string =>
  value === null ? "—" : `${(value / 10_000).toFixed(2)} 万手`;

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "watchlist-numeric";
  return `watchlist-numeric ${value > 0 ? "watchlist-up" : "watchlist-down"}`;
};

export function RealEtfCenter({
  initialSort = "amount",
}: Readonly<{ initialSort?: SortId }> = {}) {
  const [sort, setSort] = useState<SortId>(initialSort);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      /*
       * 进「读取中」放在异步体的第一句，而不是 effect 的同步部分：
       * 同步改状态会在同一轮渲染里再触发一次。对用户没有分别——它和
       * 紧随其后的请求本来就是同一件事。
       */
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/market/etfs?sort=${sort}&page=${page}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          delayed?: boolean;
          rows?: readonly EtfRow[];
          total?: number | null;
        };
        if (cancelled) return;
        setState({
          delayed: data.delayed ?? false,
          kind: "ready",
          rows: data.rows ?? [],
          total: data.total ?? null,
        });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, page, sort]);

  return (
    <section
      aria-labelledby="etf-center-heading"
      className={styles.pageStack}
      data-testid="etf-center"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>ETF</p>
          <h1 id="etf-center-heading">ETF 中心</h1>
          <p>沪深两市在交易的 ETF，按公开行情排名。</p>
        </div>
        <div className={styles.disclosure}>
          <strong>
            {state.kind === "ready" && state.delayed
              ? "延时行情源"
              : "公开行情数据"}
          </strong>
          {/*
            站内没有交易能力。与其摆一个点了没反应的「买入」，
            不如把做不了的事直接写出来。
          */}
          <span>不提供交易 · 不构成投资建议</span>
        </div>
      </header>

      <section aria-labelledby="etf-list-heading" className={styles.panel} tabIndex={-1}>
        <div className={styles.sectionHeading}>
          <h2 id="etf-list-heading">ETF 列表</h2>
          {state.kind === "ready" && state.total !== null ? (
            <span>共 {state.total} 只</span>
          ) : null}
        </div>

        <div aria-label="排序依据" className={styles.rankings} role="group">
          {SORTS.map((item) => (
            <button
              aria-pressed={sort === item.id}
              key={item.id}
              onClick={() => {
                setSort(item.id);
                // 换排序要回到第一页，否则会停在上一种口径的第 5 页。
                setPage(1);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/*
          常驻的播报区。此前它只在 loading 时挂出来——元素和文字同一帧进入
          DOM，多数读屏不会念；等结果回来它又被卸载了。现在它一直在，
          只换文字，所以切排序、切市场、失败都会被念出来。
        */}
        <p aria-live="polite" className={styles.resultStatus} role="status">
          {state.kind === "loading"
            ? "正在读取……"
            : state.kind === "failed"
              ? "ETF列表取不到。"
              : `已列出 ${state.rows.length} 条。`}
        </p>

        {state.kind === "loading" ? (
          <p className={styles.resultStatus}>
            正在读取 ETF 列表……
          </p>
        ) : null}

        {state.kind === "failed" ? (
          <p className={styles.resultStatus}>
            ETF 列表暂时取不到。{" "}
            <button
              /*
               * 重试会把这个按钮自己所在的容器卸载掉，焦点因此掉回 body——
               * 键盘用户被弹到文档顶端，得重新穿过整个页头、导航和右栏
               * 才能回来。所以先把焦点交给整块面板。
               */
              onClick={(event) => {
                event.currentTarget.closest("section")?.focus();
                setAttempt((current) => current + 1);
              }}
              type="button"
            >
              重试
            </button>
          </p>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <ScrollableTable label="ETF 列表">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th scope="col">ETF</th>
                    <th className="watchlist-numeric" scope="col">
                      最新价
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      涨跌幅
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      成交额
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      成交量
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((etf) => (
                    <tr key={etf.code}>
                      <th scope="row">
                        {/*
                          站内渲染不出来的代码不给链接：先许诺点得进去、
                          再给一张空页，比不给链接更糟。
                        */}
                        {etf.href === null ? (
                          <span>{etf.name}</span>
                        ) : (
                          <Link href={etf.href}>{etf.name}</Link>
                        )}
                        <small>{etf.code}</small>
                      </th>
                      <td className="watchlist-numeric">
                        {formatPrice(etf.last)}
                      </td>
                      <td className={toneClass(etf.changePercent)}>
                        {formatPercent(etf.changePercent)}
                      </td>
                      <td className="watchlist-numeric">
                        {formatAmount(etf.amount)}
                      </td>
                      <td className="watchlist-numeric">
                        {formatVolume(etf.volumeHands)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>

            <div aria-label="翻页" className={styles.rankings} role="group">
              <button
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                上一页
              </button>
              <span className={styles.resultStatus}>第 {page} 页</span>
              <button
                /*
                 * 这一页不满一整页就说明到底了。上游没有「还有没有下一页」
                 * 这个信号，翻过去只会是一片空白。
                 */
                disabled={state.rows.length < PAGE_SIZE}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          </>
        ) : null}

        <p className={styles.resultStatus}>
          行情来自公开接口；成交额按元换算成亿元，成交量按手换算成万手。
          取不到的值显示「—」，不以 0 代替。
        </p>
      </section>
    </section>
  );
}
