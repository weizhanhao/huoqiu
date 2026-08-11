import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import InstrumentPage from "../../../src/app/instruments/[listingId]/page";
import MarketRankingsPage from "../../../src/app/markets/rankings/page";
import MarketsPage from "../../../src/app/markets/page";
import PortfolioPage from "../../../src/app/portfolios/[portfolioId]/page";
import PortfoliosPage from "../../../src/app/portfolios/page";
import { syntheticListings } from "../../../src/features/market-portfolio/synthetic-data";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const renderRoute = (children: ReactNode): string =>
  renderToStaticMarkup(
    <D0WatchlistProvider
      knownListingIds={syntheticListings.map((listing) => listing.listingId)}
    >
      {children}
    </D0WatchlistProvider>,
  );

const extractNavigation = (markup: string, pattern: RegExp): string =>
  pattern.exec(markup)?.[1] ?? "";

const expectPrimaryDestination = (markup: string, href: string): void => {
  const desktopNavigation = extractNavigation(
    markup,
    /<nav aria-label="主导航">([\s\S]*?)<\/nav>/u,
  );
  const mobileNavigation = extractNavigation(
    markup,
    /<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/u,
  );
  const escapedHref = href.replaceAll("/", "\\/");
  const currentDestination = new RegExp(
    `<a[^>]*(?:aria-current="page"[^>]*href="${escapedHref}"|href="${escapedHref}"[^>]*aria-current="page")`,
    "u",
  );

  expect(desktopNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
  expect(desktopNavigation).toMatch(currentDestination);
  expect(mobileNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
  expect(mobileNavigation).toMatch(currentDestination);
};

describe("market and portfolio route shell truth", () => {
  it("keeps market dashboards and rankings current in both navigation layers", () => {
    expectPrimaryDestination(renderRoute(<MarketsPage />), "/markets");
    expectPrimaryDestination(renderRoute(<MarketRankingsPage />), "/markets");
  });

  it("keeps instrument detail current as a market surface", async () => {
    const instrument = await InstrumentPage({
      params: Promise.resolve({ listingId: "listing_syn_0002" }),
      searchParams: Promise.resolve({}),
    });

    expectPrimaryDestination(renderRoute(instrument), "/markets");
  });

  it("keeps portfolio dashboard and detail current in both navigation layers", async () => {
    const portfolioDetail = await PortfolioPage({
      params: Promise.resolve({ portfolioId: "portfolio_syn_0001" }),
    });

    expectPrimaryDestination(renderRoute(<PortfoliosPage />), "/portfolios");
    expectPrimaryDestination(renderRoute(portfolioDetail), "/portfolios");
  });
});
