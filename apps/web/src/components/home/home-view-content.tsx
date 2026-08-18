"use client";

import type { ReactNode } from "react";

import { HomeMarketOverview } from "./home-market-overview";
import { useOptionalHomeView } from "./home-view-context";

export function HomeViewContent({
  children,
}: Readonly<{ children: ReactNode }>) {
  const homeView = useOptionalHomeView();
  const view = homeView?.view ?? "feed";

  return (
    <div className="home-view-stage" data-home-view={view}>
      {view === "watchlist" ? (
        <>
          <h2 className="visually-hidden">我的自选</h2>
          <HomeMarketOverview watchlistView />
        </>
      ) : (
        children
      )}
    </div>
  );
}
