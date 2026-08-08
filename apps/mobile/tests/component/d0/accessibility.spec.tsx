import { tokens } from "@huoqiu/native-ui";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { HomeFeed } from "../../../src/components/d0/home-feed";
import { InstrumentSearch } from "../../../src/components/d0/instrument-search";
import { WatchlistPanel } from "../../../src/components/d0/watchlist-panel";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { d0TextColors } from "../../../src/styles/d0-colors";

vi.mock("../../../src/stores/d0-watchlist", () => ({
  useD0Watchlist: () => ({
    add: vi.fn(),
    has: () => true,
    listingIds: ["listing_syn_0001"],
    remove: vi.fn(),
    reset: vi.fn(),
  }),
}));

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

const relativeLuminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (channels?.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  return channels
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) =>
        sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
      0,
    );
};

const contrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

type ElementProperties = Readonly<{
  accessibilityLabel?: string;
  children?: ReactNode;
  placeholderTextColor?: string;
  style?: unknown;
  testID?: string;
}>;

const propertiesOf = (element: ReactElement): ElementProperties =>
  element.props as ElementProperties;

const literalText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement(node)) {
    return "";
  }
  return Children.toArray(propertiesOf(node).children)
    .map(literalText)
    .join("");
};

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
  for (const child of Children.toArray(propertiesOf(node).children)) {
    if (!isValidElement(child)) {
      continue;
    }
    try {
      return findElement(child, predicate);
    } catch {
      // Continue until the requested rendered element is found.
    }
  }
  throw new Error("Expected a matching rendered element");
};

const textColor = (element: ReactElement): string => {
  const flattened = StyleSheet.flatten(
    propertiesOf(element).style as Parameters<typeof StyleSheet.flatten>[0],
  ) as Readonly<{ color?: string }> | undefined;
  if (flattened?.color === undefined) {
    throw new Error("Expected rendered text to have a color");
  }
  return flattened.color;
};

const backgroundColor = (element: ReactElement): string => {
  const flattened = StyleSheet.flatten(
    propertiesOf(element).style as Parameters<typeof StyleSheet.flatten>[0],
  ) as Readonly<{ backgroundColor?: string }> | undefined;
  if (flattened?.backgroundColor === undefined) {
    throw new Error("Expected rendered surface to have a background color");
  }
  return flattened.backgroundColor;
};

describe("D0 mobile WCAG AA color use", () => {
  it("keeps every small semantic text color at WCAG AA contrast", () => {
    expect(
      contrastRatio(d0TextColors.marketUp, tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(d0TextColors.marketDown, tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(d0TextColors.warning, tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(d0TextColors.placeholder, tokens.surface.canvas),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("uses accessible small red, warning, and placeholder text on their surfaces", () => {
    const fixture = readyFixture();
    const search = InstrumentSearch({
      fixture,
      query: "SYN001",
      state: "normal",
      submittedQuery: "SYN001",
    });
    const resultChange = findElement(
      search,
      (element) =>
        literalText(element) === `+${fixture.quotes[0]?.change_pct}%`,
    );
    const searchInput = findElement(
      search,
      (element) =>
        propertiesOf(element).accessibilityLabel === "输入演示标的关键词",
    );
    const home = HomeFeed({ fixture, state: "normal" });
    const warning = findElement(
      home,
      (element) => literalText(element) === "演示数据，不构成投资建议",
    );

    expect(
      contrastRatio(textColor(resultChange), tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(textColor(warning), tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(
        propertiesOf(searchInput).placeholderTextColor ?? "",
        tokens.surface.canvas,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("renders the real hero kicker at AA contrast on its inverse surface", () => {
    const home = HomeFeed({ fixture: readyFixture(), state: "normal" });
    const heroKicker = findElement(
      home,
      (element) => literalText(element) === "D0 / FIXTURE FEED",
    );
    const heroSurface = findElement(home, (element) => {
      const flattened = StyleSheet.flatten(
        propertiesOf(element).style as Parameters<typeof StyleSheet.flatten>[0],
      ) as Readonly<{ backgroundColor?: string }> | undefined;
      return (
        flattened?.backgroundColor === tokens.surface.inverse &&
        literalText(element).includes("D0 / FIXTURE FEED")
      );
    });

    expect(
      contrastRatio(textColor(heroKicker), backgroundColor(heroSurface)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("renders the real market kicker at AA contrast on its base surface", () => {
    const home = HomeFeed({ fixture: readyFixture(), state: "normal" });
    const marketKicker = findElement(
      home,
      (element) => literalText(element) === "合成行情",
    );
    const marketSurface = findElement(home, (element) => {
      const flattened = StyleSheet.flatten(
        propertiesOf(element).style as Parameters<typeof StyleSheet.flatten>[0],
      ) as Readonly<{ backgroundColor?: string }> | undefined;
      return (
        flattened?.backgroundColor === tokens.surface.base &&
        literalText(element).includes("合成行情")
      );
    });

    expect(
      contrastRatio(textColor(marketKicker), backgroundColor(marketSurface)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the watchlist detail control at least a 44pt touch target", () => {
    const watchlist = WatchlistPanel({
      fixture: readyFixture(),
      state: "normal",
    });
    const detailTarget = findElement(
      watchlist,
      (element) =>
        propertiesOf(element).testID === "watchlist-detail-listing_syn_0001",
    );
    const flattened = StyleSheet.flatten(
      propertiesOf(detailTarget).style as Parameters<
        typeof StyleSheet.flatten
      >[0],
    ) as Readonly<{ minHeight?: number }> | undefined;

    expect(flattened?.minHeight).toBeGreaterThanOrEqual(44);
  });
});
