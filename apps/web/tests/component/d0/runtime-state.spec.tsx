import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import InstrumentPage from "../../../src/app/instruments/[listingId]/page";
import HomePage from "../../../src/app/page";
import SearchPage from "../../../src/app/search/page";
import WatchlistPage from "../../../src/app/watchlist/page";
import {
  normalizeD0FixtureState,
  retryD0FixtureState,
} from "../../../src/lib/d0-page-state";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

describe("D0 Web runtime state injection", () => {
  it.each([
    ["normal", "normal"],
    ["loading", "loading"],
    ["empty", "empty"],
    ["error", "error"],
    [["loading", "error"], "loading"],
    ["unknown", "normal"],
    [undefined, "normal"],
  ] as const)("normalizes %j to %s", (value, expected) => {
    expect(normalizeD0FixtureState(value)).toBe(expected);
  });

  it("renders a browser-addressable loading state on the feed", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({ fixture_state: "loading" }),
      }),
    );

    expect(markup).toContain("正在加载演示数据");
    expect(markup).not.toContain("合成市场的第一份观察");
  });

  it("renders a browser-addressable error state on search", async () => {
    const markup = renderToStaticMarkup(
      await SearchPage({
        searchParams: Promise.resolve({
          fixture_state: "error",
          q: "SYN001",
        }),
      }),
    );

    expect(markup).toContain("演示搜索暂时不可用");
    expect(markup).toMatch(/role="alert"[\s\S]*重试/u);
    expect(markup).not.toContain('class="search-results"');
  });

  it("renders a browser-addressable empty state on instrument detail", async () => {
    const markup = renderToStaticMarkup(
      await InstrumentPage({
        params: Promise.resolve({ listingId: "listing_syn_0001" }),
        searchParams: Promise.resolve({ fixture_state: "empty" }),
      }),
    );

    expect(markup).toContain("暂无演示标的详情");
    expect(markup).not.toContain('class="instrument-detail"');
  });

  it("renders a browser-addressable error state on watchlist", async () => {
    const page = await WatchlistPage({
      searchParams: Promise.resolve({ fixture_state: "error" }),
    });
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        {page}
      </D0WatchlistProvider>,
    );

    expect(markup).toContain("演示自选暂时不可用");
    expect(markup).toMatch(/role="alert"[\s\S]*重试/u);
    expect(markup).not.toContain('class="watchlist-table-wrap"');
  });

  it("removes fixture_state on retry and preserves the rest of the URL", () => {
    const assign = vi.fn();
    const reload = vi.fn();

    retryD0FixtureState({
      assign,
      href: "http://127.0.0.1:3000/search?q=SYN001&fixture_state=error",
      reload,
    });

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/search?q=SYN001",
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a non-injected transient error instead of leaving a dead button", () => {
    const assign = vi.fn();
    const reload = vi.fn();

    retryD0FixtureState({
      assign,
      href: "http://127.0.0.1:3000/",
      reload,
    });

    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
