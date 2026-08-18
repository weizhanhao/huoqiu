"use client";

import Link from "next/link";
import { useState } from "react";

import { WatchlistQuotes } from "../watchlist/watchlist-quotes";
import { RailHotFunds } from "../shell/rail-hot-funds";
import { PortfolioLeaderboard } from "../../features/market-portfolio/portfolio-leaderboard";
import { useD0Watchlist } from "../../stores/d0-watchlist";

type Panel = "fund" | "portfolio" | "stock";

/** 只对同事现有真实数据组件做雪球式编排，不再维护第二套状态。 */
export function HomeRealDataPanel() {
  const [active, setActive] = useState<Panel>("fund");
  const { listingIds } = useD0Watchlist();

  return (
    <section
      className="home-optional home-real-data-panel"
      aria-label="首页真实数据"
    >
      <div className="home-optional-tabs" role="tablist" aria-label="自选类型">
        {(
          [
            ["stock", "自选股票"],
            ["fund", "自选基金"],
            ["portfolio", "自选组合"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={active === id}
            key={id}
            onClick={() => setActive(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Link
        className="home-optional-settings"
        href="/settings"
        aria-label="自选设置"
      >
        ◇
      </Link>

      <div className="home-real-data-content" role="tabpanel">
        {active === "stock" ? (
          listingIds.length > 0 ? (
            <WatchlistQuotes symbols={listingIds} />
          ) : (
            <p className="home-real-empty">
              还没有自选股票。<Link href="/markets">去行情页添加</Link>
            </p>
          )
        ) : active === "fund" ? (
          <RailHotFunds />
        ) : (
          <PortfolioLeaderboard />
        )}
      </div>
    </section>
  );
}
