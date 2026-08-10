import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { WatchlistPanel } from "../../../src/components/watchlist/watchlist-panel";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import {
  d0WatchlistInitialState,
  d0WatchlistReducer,
  D0WatchlistProvider,
} from "../../../src/stores/d0-watchlist";
import * as marketDashboard from "../../../src/features/market-portfolio/market-dashboard";
import * as marketRankings from "../../../src/features/market-portfolio/market-rankings";
import * as portfolioDashboard from "../../../src/features/market-portfolio/portfolio-dashboard";
import * as portfolioDetail from "../../../src/features/market-portfolio/portfolio-detail";
import * as syntheticData from "../../../src/features/market-portfolio/synthetic-data";

const featureRoot = fileURLToPath(
  new URL("../../../src/features/market-portfolio/", import.meta.url),
);

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

const listingIds = syntheticData.syntheticListings.map(
  (listing) => (listing as { listingId: string }).listingId,
);

const renderInSession = (children: ReactNode) =>
  renderToStaticMarkup(
    <D0WatchlistProvider knownListingIds={listingIds}>
      {children}
    </D0WatchlistProvider>,
  );

describe("market and portfolio vertical slice", () => {
  it.each([
    "synthetic-data.ts",
    "market-dashboard.tsx",
    "market-rankings.tsx",
    "portfolio-dashboard.tsx",
    "portfolio-detail.tsx",
    "market-portfolio.module.css",
  ])("provides the isolated %s feature module", (filename) => {
    expect(existsSync(`${featureRoot}/${filename}`)).toBe(true);
  });

  it.each([
    ["syntheticListings", syntheticData],
    ["MarketDashboard", marketDashboard],
    ["marketDashboardReducer", marketDashboard],
    ["MarketRankings", marketRankings],
    ["marketRankingsReducer", marketRankings],
    ["PortfolioDashboard", portfolioDashboard],
    ["portfolioDashboardReducer", portfolioDashboard],
    ["PortfolioDetail", portfolioDetail],
    ["portfolioFollowReducer", portfolioDetail],
  ])("exports %s", (exportName, module) => {
    expect(module).toHaveProperty(exportName);
  });

  it("keeps at least eight plainly synthetic listings across three markets", () => {
    const listings = syntheticData.syntheticListings as readonly {
      listingId: string;
      market: string;
      synthetic: boolean;
      source: string;
    }[];

    expect(listings.length).toBeGreaterThanOrEqual(8);
    expect(new Set(listings.map((listing) => listing.market))).toEqual(
      new Set(["CN", "HK", "US"]),
    );
    expect(
      listings.every(
        (listing) => listing.synthetic && listing.source === "huoqiu-synthetic",
      ),
    ).toBe(true);
    expect(listingIds).toContain("listing_syn_0001");
  });

  it("switches the market and gain/loss board to visible Hong Kong results", () => {
    const selectedMarket = marketDashboard.marketDashboardReducer(
      { market: "CN", ranking: "gainers" },
      { type: "select-market", market: "HK" },
    );
    const selectedLosses = marketDashboard.marketDashboardReducer(
      selectedMarket,
      { type: "select-ranking", ranking: "losers" },
    );
    const markup = renderInSession(
      <marketDashboard.MarketDashboard initialState={selectedLosses} />,
    );

    expect(selectedLosses).toEqual({ market: "HK", ranking: "losers" });
    expect(markup).toContain("恒生合成指数");
    expect(markup).toContain("全球航运");
    expect(markup).toContain('href="/instruments/listing_syn_0009"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("市场热度");
    expect(markup).toContain("合成数据");
    expect(markup).toContain("不构成投资建议");
  });

  it("filters the accessible full rankings by market and decline direction", () => {
    const selectedMarket = marketRankings.marketRankingsReducer(
      { market: "ALL", ranking: "gainers" },
      { type: "select-market", market: "US" },
    );
    const selectedLosses = marketRankings.marketRankingsReducer(
      selectedMarket,
      { type: "select-ranking", ranking: "losers" },
    );
    const markup = renderInSession(
      <marketRankings.MarketRankings initialState={selectedLosses} />,
    );

    expect(markup).toContain("美股跌幅榜");
    expect(markup).toContain("北美稳健");
    expect(markup).toContain('href="/instruments/listing_syn_0007"');
    expect(markup).not.toContain("星港制造");
    expect(markup).toContain('aria-label="合成标的完整榜单"');
  });

  it("supports watchlist add, delete, quote display, and empty state", () => {
    const added = d0WatchlistReducer(d0WatchlistInitialState, {
      type: "add",
      listingId: "listing_syn_0002",
    });
    const addedMarkup = renderToStaticMarkup(
      <D0WatchlistProvider
        initialListingIds={added.listingIds}
        knownListingIds={listingIds}
      >
        <WatchlistPanel fixture={readyFixture()} />
      </D0WatchlistProvider>,
    );
    const removed = d0WatchlistReducer(added, {
      type: "remove",
      listingId: "listing_syn_0002",
    });
    const emptyMarkup = renderToStaticMarkup(
      <D0WatchlistProvider
        initialListingIds={removed.listingIds}
        knownListingIds={listingIds}
      >
        <WatchlistPanel fixture={readyFixture()} />
      </D0WatchlistProvider>,
    );

    expect(addedMarkup).toContain("星港制造");
    expect(addedMarkup).toContain("SYN002");
    expect(addedMarkup).toContain("42.68");
    expect(addedMarkup).toContain("+4.82%");
    expect(addedMarkup).toContain("移出自选");
    expect(emptyMarkup).toContain("暂无自选标的");
  });

  it("switches portfolio rankings to the visible annual leader", () => {
    const selected = portfolioDashboard.portfolioDashboardReducer(
      { period: "day" },
      { type: "select-period", period: "year" },
    );
    const markup = renderToStaticMarkup(
      <portfolioDashboard.PortfolioDashboard initialState={selected} />,
    );

    expect(selected).toEqual({ period: "year" });
    expect(markup).toContain("年度榜");
    expect(markup).toContain("远望全球组合");
    expect(markup).toContain('href="/portfolios/portfolio_syn_0001"');
    expect(markup).toContain("组合风向");
  });

  it("toggles portfolio following and renders holdings, curve, and rebalance history", () => {
    const followed = portfolioDetail.portfolioFollowReducer(false, {
      type: "toggle-follow",
    });
    const markup = renderToStaticMarkup(
      <portfolioDetail.PortfolioDetail initialFollowed={followed} />,
    );

    expect(followed).toBe(true);
    expect(markup).toContain("已关注组合");
    expect(markup).toContain("组合收益曲线");
    expect(markup).toContain("持仓明细");
    expect(markup).toContain("调仓记录");
    expect(markup).toContain("增持星港制造");
    expect(markup).toContain("2026-08-01");
    expect(markup).toContain("固定合成数据");
  });
});
