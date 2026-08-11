import { describe, expect, it } from "vitest";

import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { d0RuntimeRoutes } from "../../../src/navigation/d0-routes";
import {
  d0WatchlistInitialState,
  d0WatchlistReducer,
} from "../../../src/stores/d0-watchlist";

describe("D0 mobile seed and navigation", () => {
  it("parses the shared fixture with the stable listing identity", () => {
    const result = loadD0Fixture();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.data.version).toBe("d0.v1");
      expect(result.data.seed_user.name).toBe("演示用户");
      expect(result.data.instruments[0]?.listing_id).toBe("listing_syn_0001");
      expect(result.data.market).toEqual({
        source: "huoqiu-synthetic",
        as_of: "2026-08-08T06:00:00.000Z",
      });
    }
  });

  it("registers the five visible tabs and bounded supporting routes", () => {
    expect(d0RuntimeRoutes.tabs).toEqual([
      { href: "/home", label: "火球" },
      { href: "/watchlist", label: "自选" },
      { href: "/markets", label: "行情" },
      { href: "/portfolios", label: "组合" },
      { href: "/profile", label: "我的" },
    ]);
    expect(d0RuntimeRoutes.stack).toEqual([
      { href: "/search", label: "搜索" },
      { href: "/instrument/[listingId]", label: "标的详情" },
      { href: "/portfolio/[portfolioId]", label: "组合详情" },
      { href: "/messages", label: "消息" },
      { href: "/settings", label: "设置" },
    ]);

    const runtimeSurface = JSON.stringify(d0RuntimeRoutes);
    for (const forbidden of [
      "基金",
      "私募",
      "策略研究",
      "开户",
      "认购",
      "交易",
    ]) {
      expect(runtimeSurface).not.toContain(forbidden);
    }
  });

  it("keeps local watchlist updates idempotent and resettable", () => {
    const once = d0WatchlistReducer(d0WatchlistInitialState, {
      type: "add",
      listingId: "listing_syn_0001",
    });
    const twice = d0WatchlistReducer(once, {
      type: "add",
      listingId: "listing_syn_0001",
    });

    expect(twice.listingIds).toEqual(["listing_syn_0001"]);
    expect(
      d0WatchlistReducer(twice, {
        type: "remove",
        listingId: "listing_syn_0001",
      }),
    ).toEqual(d0WatchlistInitialState);
    expect(d0WatchlistReducer(twice, { type: "reset" })).toEqual(
      d0WatchlistInitialState,
    );
  });
});
