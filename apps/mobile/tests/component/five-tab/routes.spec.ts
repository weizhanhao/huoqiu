import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { d0RuntimeRoutes } from "../../../src/navigation/d0-routes";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const readRegisteredNames = (source: string, element: "Stack" | "Tabs") =>
  [
    ...source.matchAll(
      new RegExp(`<${element}\\.Screen[\\s\\S]*?name="([^"]+)"`, "gu"),
    ),
  ]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);

describe("mobile five-tab route registry", () => {
  it("exposes five real primary destinations in the approved order", () => {
    expect(d0RuntimeRoutes.tabs).toEqual([
      { href: "/home", label: "火球" },
      { href: "/watchlist", label: "自选" },
      { href: "/markets", label: "行情" },
      { href: "/portfolios", label: "组合" },
      { href: "/profile", label: "我的" },
    ]);
  });

  it("registers the supporting screens reached from the primary tabs", () => {
    expect(d0RuntimeRoutes.stack).toEqual(
      expect.arrayContaining([
        { href: "/portfolio/[portfolioId]", label: "组合详情" },
        { href: "/messages", label: "消息" },
        { href: "/settings", label: "设置" },
      ]),
    );
  });

  it("backs every registry destination with an Expo route file", () => {
    for (const route of d0RuntimeRoutes.tabs) {
      expect(existsSync(join(mobileRoot, `app/(tabs)${route.href}.tsx`))).toBe(
        true,
      );
    }
    for (const relativePath of [
      "app/portfolio/[portfolioId].tsx",
      "app/messages.tsx",
      "app/settings.tsx",
    ]) {
      expect(existsSync(join(mobileRoot, relativePath))).toBe(true);
    }
  });

  it("registers exactly five tab screens and every supporting stack screen", () => {
    const tabLayout = readFileSync(
      join(mobileRoot, "app/(tabs)/_layout.tsx"),
      "utf8",
    );
    const rootLayout = readFileSync(
      join(mobileRoot, "app/_layout.tsx"),
      "utf8",
    );

    expect(readRegisteredNames(tabLayout, "Tabs")).toEqual([
      "home",
      "watchlist",
      "markets",
      "portfolios",
      "profile",
    ]);
    expect(readRegisteredNames(rootLayout, "Stack")).toEqual(
      expect.arrayContaining([
        "portfolio/[portfolioId]",
        "messages",
        "settings",
      ]),
    );
  });

  it("applies the App touch minimum directly to every primary tab item", () => {
    const tabLayout = readFileSync(
      join(mobileRoot, "app/(tabs)/_layout.tsx"),
      "utf8",
    );

    expect(tabLayout).toMatch(
      /tabBarItemStyle:\s*\{\s*minHeight:\s*appTouchMinimum\s*\}/u,
    );
  });
});
