"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { AccountPortfolios } from "../../features/market-portfolio/account-portfolios";
import type { D0PageState } from "../../lib/d0-page-state";
import { FundWatchlistPanel } from "./fund-watchlist-panel";
import { WatchlistPanel, type WatchlistEntry } from "./watchlist-panel";
import styles from "./watchlist-workspace.module.css";

type Tab = "fund" | "portfolio" | "stock";

export function WatchlistWorkspace({
  initialTab = "stock",
  realEntries,
  state,
}: Readonly<{
  initialTab?: Tab;
  realEntries: readonly WatchlistEntry[];
  state: D0PageState;
}>) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(
    () => new Set([initialTab]),
  );
  const preservedScroll = useRef<number | null>(null);

  const selectTab = (next: Tab): void => {
    if (next === tab) return;
    preservedScroll.current = globalThis.scrollY;
    setVisited((current) =>
      current.has(next) ? current : new Set([...current, next]),
    );
    setTab(next);
  };

  /*
   * 三个面板高度不同，并且基金/组合还会异步补内容。浏览器会为维持自己的
   * scroll anchor 自动改 scrollY，视觉上就是左侧 sticky 菜单整块上移。
   * layout effect 在新面板绘制前恢复点击时的位置，不让中间帧露出来。
   */
  useLayoutEffect(() => {
    const top = preservedScroll.current;
    if (top === null) return undefined;
    globalThis.scrollTo({ behavior: "instant", left: 0, top });
    const frame = globalThis.requestAnimationFrame(() => {
      globalThis.scrollTo({ behavior: "instant", left: 0, top });
      preservedScroll.current = null;
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [tab]);

  return (
    <section className={`watchlist-workspace ${styles.workspace}`}>
      <nav
        className={`watchlist-product-tabs ${styles.tabs}`}
        aria-label="自选类型"
        role="tablist"
      >
        <button
          aria-selected={tab === "stock"}
          id="watchlist-tab-stock"
          onClick={() => selectTab("stock")}
          role="tab"
          type="button"
        >
          自选股票
        </button>
        <button
          aria-selected={tab === "fund"}
          id="watchlist-tab-fund"
          onClick={() => selectTab("fund")}
          role="tab"
          type="button"
        >
          自选基金
        </button>
        <button
          aria-selected={tab === "portfolio"}
          id="watchlist-tab-portfolio"
          onClick={() => selectTab("portfolio")}
          role="tab"
          type="button"
        >
          自选组合
        </button>
      </nav>
      <div
        aria-labelledby="watchlist-tab-stock"
        className={styles.stage}
        hidden={tab !== "stock"}
        role="tabpanel"
      >
        {visited.has("stock") ? (
          <WatchlistPanel realEntries={realEntries} state={state} />
        ) : null}
      </div>
      <div
        aria-labelledby="watchlist-tab-fund"
        className={styles.stage}
        hidden={tab !== "fund"}
        role="tabpanel"
      >
        {visited.has("fund") ? <FundWatchlistPanel /> : null}
      </div>
      <div
        aria-labelledby="watchlist-tab-portfolio"
        className={styles.stage}
        hidden={tab !== "portfolio"}
        role="tabpanel"
      >
        {visited.has("portfolio") ? <AccountPortfolios /> : null}
      </div>
    </section>
  );
}
