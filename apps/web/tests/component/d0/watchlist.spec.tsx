import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import RootLayout from "../../../src/app/layout";
import { WatchlistPanel } from "../../../src/components/watchlist/watchlist-panel";
import { WatchlistToggle } from "../../../src/components/watchlist/watchlist-toggle";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import {
  createD0WatchlistState,
  D0WatchlistProvider,
} from "../../../src/stores/d0-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
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

describe("D0 session watchlist", () => {
  it("normalizes initial state to unique, known listing IDs", () => {
    expect(
      createD0WatchlistState(
        ["listing_syn_0001", "unknown", "listing_syn_0001"],
        ["listing_syn_0001"],
      ),
    ).toEqual({ listingIds: ["listing_syn_0001"] });
  });

  it("renders an explicit empty state before any listing is added", () => {
    const markup = renderWithWatchlist(
      <WatchlistPanel fixture={readyFixture()} />,
      [],
    );

    expect(markup).toContain("暂无自选标的");
    expect(markup).toContain("仅在当前浏览会话中保存");
    expect(markup).not.toContain("SYN001");
  });

  it("renders stable quote identity and a removal control after add", () => {
    const markup = renderWithWatchlist(
      <WatchlistPanel fixture={readyFixture()} />,
      ["listing_syn_0001"],
    );

    expect(markup).toContain("我的自选");
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain('href="/instruments/listing_syn_0001"');
    expect(markup).toContain("移出自选");
  });

  it("exposes an idempotent toggle state for add and remove", () => {
    const addedMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      [],
    );
    const removedMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      ["listing_syn_0001"],
    );

    expect(addedMarkup).toContain('aria-pressed="false"');
    expect(addedMarkup).toContain("加自选");
    expect(removedMarkup).toContain('aria-pressed="true"');
    expect(removedMarkup).toContain("已加自选");
  });

  it("mounts the session provider once at the application root", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <WatchlistToggle listingId="listing_syn_0001" />
      </RootLayout>,
    );

    expect(markup).toContain("加自选");
    expect(markup).toContain("仅当前会话");
  });
});
