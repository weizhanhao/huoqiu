import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as marketDashboard from "../../../src/features/market-portfolio/market-dashboard";
import * as marketRankings from "../../../src/features/market-portfolio/market-rankings";
import * as portfolioDashboard from "../../../src/features/market-portfolio/portfolio-dashboard";
import * as portfolioDetail from "../../../src/features/market-portfolio/portfolio-detail";
import * as syntheticData from "../../../src/features/market-portfolio/synthetic-data";

const featureRoot = fileURLToPath(
  new URL("../../../src/features/market-portfolio/", import.meta.url),
);

const listingIds = syntheticData.syntheticListings.map(
  (listing) => (listing as { listingId: string }).listingId,
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

  it("stores concept performance as a numeric value with a separate name", () => {
    expect(syntheticData.marketConcepts.CN[0]).toEqual({
      name: "先进制造",
      value: 3.8,
    });
    expect(syntheticData.marketConcepts.HK[2]).toEqual({
      name: "航运",
      value: -2.8,
    });
  });
});
