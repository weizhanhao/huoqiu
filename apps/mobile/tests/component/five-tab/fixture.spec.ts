import { describe, expect, it } from "vitest";

import {
  getMarketSnapshot,
  getPortfolioDetail,
  getPortfolioHub,
  marketRegions,
  portfolioPeriods,
  settingsDensityOptions,
  syntheticMessages,
  syntheticProfile,
} from "../../../src/features/five-tab/synthetic-fixture";

describe("five-tab synthetic fixture queries", () => {
  it("returns a complete fixed market snapshot for every supported region", () => {
    expect(marketRegions).toEqual([
      { id: "a", label: "A股" },
      { id: "hk", label: "港股" },
      { id: "us", label: "美股" },
      { id: "global", label: "全球" },
    ]);

    for (const region of marketRegions) {
      const snapshot = getMarketSnapshot(region.id);
      expect(snapshot.region).toBe(region.id);
      expect(snapshot.source).toBe("huoqiu-synthetic");
      expect(snapshot.asOf).toBe("2026-08-11T06:30:00.000Z");
      expect(snapshot.indices).toHaveLength(3);
      expect(
        snapshot.breadth.up + snapshot.breadth.flat + snapshot.breadth.down,
      ).toBeGreaterThan(0);
      expect(snapshot.ranking).toHaveLength(3);
    }

    expect(getMarketSnapshot("a").indices[0]).toEqual({
      changePct: 0.82,
      id: "index_syn_a_0001",
      last: "3,428.16",
      name: "合成沪指",
      symbol: "SYN-A01",
    });
  });

  it("returns period rankings and a navigable synthetic portfolio detail", () => {
    expect(portfolioPeriods).toEqual([
      { id: "day", label: "日榜" },
      { id: "week", label: "周榜" },
      { id: "year", label: "年榜" },
    ]);

    const dayHub = getPortfolioHub("day");
    expect(dayHub.source).toBe("huoqiu-synthetic");
    expect(dayHub.summary).toEqual({ flat: 0.16, loss: 29.87, profit: 69.97 });
    expect(dayHub.signals).toHaveLength(3);
    expect(dayHub.ranking).toHaveLength(3);
    expect(dayHub.ranking[0]).toMatchObject({
      id: "portfolio_syn_0001",
      returnPct: 6.28,
      title: "星河观察组合",
    });
    expect(getPortfolioHub("year").ranking[0]?.returnPct).toBe(38.42);

    const detail = getPortfolioDetail("portfolio_syn_0001");
    expect(detail).toMatchObject({
      id: "portfolio_syn_0001",
      source: "huoqiu-synthetic",
      title: "星河观察组合",
    });
    expect(detail?.holdings).toHaveLength(3);
    expect(detail?.adjustments).toHaveLength(3);
    expect(getPortfolioDetail("portfolio_missing")).toBeUndefined();
  });

  it("provides a synthetic identity with real local destinations and unavailable accounts", () => {
    expect(syntheticProfile).toMatchObject({
      alias: "合成观察员 017",
      id: "profile_syn_0017",
      source: "huoqiu-synthetic",
    });
    expect(syntheticProfile.sessionDisclosure).toContain("本次演示会话");
    expect(syntheticProfile.entries).toEqual([
      { destination: "messages", label: "消息", meta: "3 条合成未读" },
      { destination: "settings", label: "设置", meta: "偏好与披露" },
      { destination: "watchlist", label: "自选", meta: "本次会话" },
      { destination: "portfolios", label: "组合", meta: "3 个合成组合" },
    ]);
    expect(syntheticProfile.unavailableCapabilities).toEqual([
      "证券账户（未开放）",
      "基金账户（未开放）",
      "真实交易（未开放）",
    ]);
  });

  it("provides fixed synthetic messages and session-only setting choices", () => {
    expect(syntheticMessages).toHaveLength(3);
    expect(syntheticMessages[0]).toEqual({
      at: "2026-08-11T06:18:00.000Z",
      body: "你关于合成示例一号的观察收到一条演示回复。",
      id: "message_syn_0001",
      kind: "回复",
      source: "huoqiu-synthetic",
      title: "合成用户乙回复了你",
    });
    expect(
      syntheticMessages.every(
        (message) => message.source === "huoqiu-synthetic",
      ),
    ).toBe(true);
    expect(settingsDensityOptions).toEqual([
      { id: "comfortable", label: "舒适" },
      { id: "compact", label: "紧凑" },
    ]);
  });
});
