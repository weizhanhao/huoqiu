import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import {
  d0WatchlistInitialState,
  d0WatchlistReducer,
} from "../../../src/stores/d0-watchlist";

describe("D0 Web seed session", () => {
  it("renders only the fixture identity and approved D0 navigation", () => {
    const markup = renderToStaticMarkup(
      <DesktopShell>
        <p>内容</p>
      </DesktopShell>,
    );

    expect(markup).toContain("演示用户");
    expect(markup).toContain("演示数据");
    expect(markup).toContain("内容");
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toContain('action="/search"');
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("仅本机演示，不会跨端同步");

    for (const forbidden of [
      "私募认购",
      "开户",
      "交易下单",
      "基金",
      "组合",
      "消息",
      "发布",
    ]) {
      expect(markup).not.toContain(forbidden);
    }
  });

  it("parses the shared fixture once into an explicit ready result", () => {
    const result = loadD0Fixture();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.data.version).toBe("d0.v1");
      expect(result.data.instruments[0]?.listing_id).toBe("listing_syn_0001");
      expect(result.data.watchlist).toEqual({
        persistence: "session-only",
        listing_ids: [],
      });
    }
  });

  it("keeps watchlist changes idempotent, ordered, and resettable", () => {
    const once = d0WatchlistReducer(d0WatchlistInitialState, {
      type: "add",
      listingId: "listing_syn_0001",
    });
    const twice = d0WatchlistReducer(once, {
      type: "add",
      listingId: "listing_syn_0001",
    });
    const withSecond = d0WatchlistReducer(twice, {
      type: "add",
      listingId: "listing_syn_0002",
    });

    expect(twice.listingIds).toEqual(["listing_syn_0001"]);
    expect(withSecond.listingIds).toEqual([
      "listing_syn_0001",
      "listing_syn_0002",
    ]);
    expect(
      d0WatchlistReducer(withSecond, {
        type: "remove",
        listingId: "listing_syn_0001",
      }).listingIds,
    ).toEqual(["listing_syn_0002"]);
    expect(d0WatchlistReducer(withSecond, { type: "reset" })).toEqual(
      d0WatchlistInitialState,
    );
  });
});
