import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { WatchlistPanel } from "../../../../src/components/watchlist/watchlist-panel";
import { DesktopShell } from "../../../../src/components/shell/desktop-shell";
import { MarketDashboard } from "../../../../src/features/market-portfolio/market-dashboard";
import { MarketRankings } from "../../../../src/features/market-portfolio/market-rankings";
import { PortfolioDashboard } from "../../../../src/features/market-portfolio/portfolio-dashboard";
import { PortfolioDetail } from "../../../../src/features/market-portfolio/portfolio-detail";
import { SyntheticInstrumentDetail } from "../../../../src/features/market-portfolio/synthetic-instrument-detail";
import { syntheticListings } from "../../../../src/features/market-portfolio/synthetic-data";
import { loadD0Fixture } from "../../../../src/lib/d0-fixture";
import { D0WatchlistProvider } from "../../../../src/stores/d0-watchlist";

import "../../../../src/app/globals.css";

const fixtureResult = loadD0Fixture();
if (fixtureResult.status !== "ready") {
  throw new Error("Expected the checked-in D0 fixture to parse");
}
const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the browser harness root element");
}

const surface =
  window.location.pathname === "/markets" ? (
    <DesktopShell>
      <MarketDashboard />
    </DesktopShell>
  ) : (
    <>
      <div data-testid="market-dashboard">
        <MarketDashboard />
      </div>
      <div data-testid="market-rankings">
        <MarketRankings />
      </div>
      <div data-testid="watchlist">
        <WatchlistPanel fixture={fixtureResult.data} />
      </div>
      <div data-testid="portfolio-dashboard">
        <PortfolioDashboard />
      </div>
      <div data-testid="portfolio-detail">
        <PortfolioDetail />
      </div>
      <div
        data-testid="instrument-detail"
        style={{ paddingInline: "var(--hq-spacing-3)" }}
      >
        <SyntheticInstrumentDetail listing={syntheticListings[1]} />
      </div>
    </>
  );

createRoot(root).render(
  <D0WatchlistProvider
    knownListingIds={syntheticListings.map((listing) => listing.listingId)}
  >
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    {surface}
  </D0WatchlistProvider>,
);
