import { tokens } from "@huoqiu/native-ui";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StyleSheet } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { MarketOverview } from "../../../src/components/five-tab/market-overview";
import { MessageCenter } from "../../../src/components/five-tab/message-center";
import { PortfolioDetailView } from "../../../src/components/five-tab/portfolio-detail";
import { PortfolioHub } from "../../../src/components/five-tab/portfolio-hub";
import { ProfileHub } from "../../../src/components/five-tab/profile-hub";
import { SettingsPanel } from "../../../src/components/five-tab/settings-panel";
import {
  getMarketSnapshot,
  getPortfolioDetail,
  getPortfolioHub,
  syntheticMessages,
  syntheticProfile,
} from "../../../src/features/five-tab/synthetic-fixture";

type ElementProperties = Readonly<{
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: Readonly<{ selected?: boolean }>;
  children?: ReactNode;
  onPress?: () => void;
  style?: unknown;
  tabIndex?: number;
}>;

const findElement = (
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement => {
  if (!isValidElement(node)) {
    throw new Error("Expected a matching rendered element");
  }
  if (predicate(node)) {
    return node;
  }
  const properties = node.props as ElementProperties;
  for (const child of Children.toArray(properties.children)) {
    if (!isValidElement(child)) {
      continue;
    }
    try {
      return findElement(child, predicate);
    } catch {
      // Continue until the requested public control is found.
    }
  }
  throw new Error("Expected a matching rendered element");
};

describe("mobile five-tab visible screens", () => {
  it("renders a complete selectable synthetic market overview", () => {
    const onSelectRegion = vi.fn();
    const onOpenInstrument = vi.fn();
    const screen = MarketOverview({
      onOpenInstrument,
      onSelectRegion,
      selectedRegion: "a",
      snapshot: getMarketSnapshot("a"),
    });
    const markup = renderToStaticMarkup(screen);

    expect(markup).toContain("行情");
    expect(markup).toContain("A股");
    expect(markup).toContain("合成沪指");
    expect(markup).toContain("市场涨跌概况");
    expect(markup).toContain("合成热度 58%");
    expect(markup).toContain("涨幅榜预览");
    expect(markup).toContain("演示数据，不构成投资建议");

    const selectedTab = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "查看A股行情",
    );
    const selectedProperties = selectedTab.props as ElementProperties;
    const selectedStyle = StyleSheet.flatten(
      selectedProperties.style as Parameters<typeof StyleSheet.flatten>[0],
    ) as Readonly<{ minHeight?: number }> | undefined;

    expect(selectedProperties.accessibilityState).toEqual({ selected: true });
    expect(selectedStyle?.minHeight).toBe(
      Number.parseInt(tokens.touch.appMinimum, 10),
    );
    selectedProperties.onPress?.();
    expect(onSelectRegion).toHaveBeenCalledWith("a");

    const instrumentLink = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "查看合成示例一号详情",
    );
    (instrumentLink.props as ElementProperties).onPress?.();
    expect(onOpenInstrument).toHaveBeenCalledWith("listing_syn_0001");
  });

  it("renders selectable portfolio signals and opens a real detail destination", () => {
    const onSelectPeriod = vi.fn();
    const onOpenPortfolio = vi.fn();
    const screen = PortfolioHub({
      hub: getPortfolioHub("day"),
      onOpenPortfolio,
      onSelectPeriod,
      selectedPeriod: "day",
    });
    const markup = renderToStaticMarkup(screen);

    expect(markup).toContain("组合");
    expect(markup).toContain("组合盈亏概况");
    expect(markup).toContain("盈利组合 69.97%");
    expect(markup).toContain("亏损组合 29.87%");
    expect(markup).toContain("组合风向指标");
    expect(markup).toContain("星河观察组合");
    expect(markup).toContain("+6.28%");
    expect(markup).toContain("纯合成组合，不连接真实账户");

    const selectedPeriod = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "查看组合日榜",
    );
    const selectedProperties = selectedPeriod.props as ElementProperties;
    const selectedStyle = StyleSheet.flatten(
      selectedProperties.style as Parameters<typeof StyleSheet.flatten>[0],
    ) as Readonly<{ minHeight?: number }> | undefined;
    expect(selectedProperties.accessibilityState).toEqual({ selected: true });
    expect(selectedStyle?.minHeight).toBe(
      Number.parseInt(tokens.touch.appMinimum, 10),
    );
    selectedProperties.onPress?.();
    expect(onSelectPeriod).toHaveBeenCalledWith("day");

    const detailLink = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "查看星河观察组合详情",
    );
    (detailLink.props as ElementProperties).onPress?.();
    expect(onOpenPortfolio).toHaveBeenCalledWith("portfolio_syn_0001");

    const summary = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "盈利组合 69.97%，平盘 0.16%，亏损组合 29.87%",
    );
    expect((summary.props as ElementProperties).accessibilityRole).toBe(
      "summary",
    );
  });

  it("renders holdings and adjustment history for a synthetic portfolio detail", () => {
    const detail = getPortfolioDetail("portfolio_syn_0001");
    if (detail === undefined) {
      throw new Error("Expected the checked-in synthetic portfolio detail");
    }
    const screen = PortfolioDetailView({ detail, onBack: () => undefined });
    const markup = renderToStaticMarkup(screen);

    expect(markup).toContain("星河观察组合");
    expect(markup).toContain("合成用户甲");
    expect(markup).toContain("成立以来 +18.64%");
    expect(markup).toContain("最大回撤 -6.24%");
    expect(markup).toContain("持仓快照");
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("云帆材料");
    expect(markup).toContain("星港智造");
    expect(markup).toContain("模拟调仓记录");
    expect(markup.match(/模拟调仓/gu)).toHaveLength(4);
    expect(markup).toContain("仅为固定合成组合，不产生真实交易");

    const scrollRegion = findElement(
      screen,
      (element) => (element.props as ElementProperties).tabIndex === 0,
    );
    expect((scrollRegion.props as ElementProperties).tabIndex).toBe(0);
  });

  it("renders a synthetic profile with four real local destinations", () => {
    const onNavigate = vi.fn();
    const screen = ProfileHub({ onNavigate, profile: syntheticProfile });
    const markup = renderToStaticMarkup(screen);

    expect(markup).toContain("我的");
    expect(markup).toContain("合成观察员 017");
    expect(markup).toContain("本次演示会话");
    expect(markup).toContain("消息");
    expect(markup).toContain("设置");
    expect(markup).toContain("自选");
    expect(markup).toContain("组合");
    expect(markup).toContain("证券账户（未开放）");
    expect(markup).toContain("基金账户（未开放）");
    expect(markup).toContain("真实交易（未开放）");

    for (const [label, destination] of [
      ["消息", "messages"],
      ["设置", "settings"],
      ["自选", "watchlist"],
      ["组合", "portfolios"],
    ] as const) {
      const entry = findElement(
        screen,
        (element) =>
          (element.props as ElementProperties).accessibilityLabel ===
          `打开${label}`,
      );
      const properties = entry.props as ElementProperties;
      const style = StyleSheet.flatten(
        properties.style as Parameters<typeof StyleSheet.flatten>[0],
      ) as Readonly<{ minHeight?: number }> | undefined;
      expect(style?.minHeight).toBe(
        Number.parseInt(tokens.touch.appMinimum, 10),
      );
      properties.onPress?.();
      expect(onNavigate).toHaveBeenCalledWith(destination);
    }
  });

  it("renders a fixed synthetic message center with absolute timestamps", () => {
    const markup = renderToStaticMarkup(
      <MessageCenter messages={syntheticMessages} onBack={() => undefined} />,
    );

    expect(markup).toContain("消息");
    expect(markup).toContain("合成用户乙回复了你");
    expect(markup).toContain("合成组合快照更新");
    expect(markup).toContain("合成用户丙赞了你");
    expect(markup).toContain("2026-08-11T06:18:00.000Z");
    expect(markup).toContain("huoqiu-synthetic");
    expect(markup).toContain("仅本次预览，不跨设备同步");
  });

  it("renders a selectable session-only settings screen", () => {
    const onSelectDensity = vi.fn();
    const screen = SettingsPanel({
      density: "comfortable",
      onBack: () => undefined,
      onSelectDensity,
    });
    const markup = renderToStaticMarkup(screen);

    expect(markup).toContain("设置");
    expect(markup).toContain("界面密度");
    expect(markup).toContain("舒适");
    expect(markup).toContain("紧凑");
    expect(markup).toContain("红涨绿跌");
    expect(markup).toContain("固定离线合成数据");
    expect(markup).toContain("会话结束后重置");
    expect(markup).toContain("证券、基金与真实交易能力仍为未开放");

    const selectedDensity = findElement(
      screen,
      (element) =>
        (element.props as ElementProperties).accessibilityLabel ===
        "使用舒适布局",
    );
    const properties = selectedDensity.props as ElementProperties;
    const style = StyleSheet.flatten(
      properties.style as Parameters<typeof StyleSheet.flatten>[0],
    ) as Readonly<{ minHeight?: number }> | undefined;
    expect(properties.accessibilityState).toEqual({ selected: true });
    expect(style?.minHeight).toBe(Number.parseInt(tokens.touch.appMinimum, 10));
    properties.onPress?.();
    expect(onSelectDensity).toHaveBeenCalledWith("comfortable");
  });
});
