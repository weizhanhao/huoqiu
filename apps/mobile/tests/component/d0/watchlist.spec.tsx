import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { WatchlistPanel } from "../../../src/components/d0/watchlist-panel";
import { WatchlistToggle } from "../../../src/components/d0/watchlist-toggle";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

const renderWithWatchlist = (
  children: ReactNode,
  initialListingIds: readonly string[],
) => {
  const fixture = readyFixture();
  return renderToStaticMarkup(
    <D0WatchlistProvider
      knownListingIds={fixture.instruments.map(
        (instrument) => instrument.listing_id,
      )}
      initialListingIds={initialListingIds}
    >
      {children}
    </D0WatchlistProvider>,
  );
};

describe("D0 mobile session watchlist", () => {
  it("renders an explicit local-only empty state", () => {
    const markup = renderWithWatchlist(
      <WatchlistPanel fixture={readyFixture()} state="normal" />,
      [],
    );

    expect(markup).toContain("暂无自选标的");
    expect(markup).toContain("仅本次演示");
    expect(markup).not.toContain("SYN001");
  });

  it("renders the stable listing exactly once after an idempotent add", () => {
    const markup = renderWithWatchlist(
      <WatchlistPanel fixture={readyFixture()} state="normal" />,
      ["listing_syn_0001", "listing_syn_0001"],
    );

    expect(markup.match(/SYN001/gu)).toHaveLength(1);
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("108.64");
    expect(markup).toContain("移出自选");
  });

  it("exposes accessible add and included toggle states", () => {
    const addMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      [],
    );
    const includedMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      ["listing_syn_0001"],
    );

    expect(addMarkup).toContain("加自选");
    expect(addMarkup).toContain('aria-pressed="false"');
    expect(includedMarkup).toContain("已加自选");
    expect(includedMarkup).toContain('aria-pressed="true"');
  });
});
