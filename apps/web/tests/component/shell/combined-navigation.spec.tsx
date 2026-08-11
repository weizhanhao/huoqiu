import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";

const channelMarkup = (activeChannel: "briefing" | "news"): string => {
  const shellMarkup = renderToStaticMarkup(
    <DesktopShell activeChannel={activeChannel}>
      <p>页面内容</p>
    </DesktopShell>,
  );

  return (
    /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      shellMarkup,
    )?.[1] ?? ""
  );
};

const mobileMarkup = (
  activeUtility: "notifications" | "profile" | "settings",
): string => {
  const shellMarkup = renderToStaticMarkup(
    <DesktopShell activeUtility={activeUtility}>
      <p>页面内容</p>
    </DesktopShell>,
  );

  return (
    /<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      shellMarkup,
    )?.[1] ?? ""
  );
};

const utilityShellMarkup = (
  activeUtility: "notifications" | "profile" | "settings",
): string =>
  renderToStaticMarkup(
    <DesktopShell activeUtility={activeUtility}>
      <p>页面内容</p>
    </DesktopShell>,
  );

describe("combined profile and finance navigation", () => {
  it("gives 7x24 and news distinct deep links with exactly one current channel", () => {
    const briefingChannels = channelMarkup("briefing");
    const newsChannels = channelMarkup("news");

    expect(briefingChannels).toContain(
      '<a aria-current="page" href="/7x24">7x24</a>',
    );
    expect(briefingChannels).toContain('<a href="/news">资讯</a>');
    expect(briefingChannels.match(/aria-current="page"/gu)).toHaveLength(1);

    expect(newsChannels).toContain('<a href="/7x24">7x24</a>');
    expect(newsChannels).toContain(
      '<a aria-current="page" href="/news">资讯</a>',
    );
    expect(newsChannels.match(/aria-current="page"/gu)).toHaveLength(1);
  });

  it("keeps five mobile items and groups profile, settings, and messages under My", () => {
    for (const activeUtility of [
      "notifications",
      "profile",
      "settings",
    ] as const) {
      const mobileNavigation = mobileMarkup(activeUtility);

      expect(mobileNavigation.match(/<a\b/gu)).toHaveLength(5);
      expect(mobileNavigation).toContain('href="/users/user_demo_0001"');
      expect(mobileNavigation).toContain("<span>我的</span>");
      expect(mobileNavigation).toContain('aria-label="5 条未读通知"');
      expect(mobileNavigation).not.toContain('href="/notifications"');
      expect(mobileNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
      expect(mobileNavigation).toMatch(
        /<a aria-current="page"[^>]*href="\/users\/user_demo_0001"/u,
      );
    }
  });

  it("exposes profile and settings as real desktop utility routes", () => {
    const profileShell = utilityShellMarkup("profile");
    const settingsShell = utilityShellMarkup("settings");
    const notificationsShell = utilityShellMarkup("notifications");

    expect(profileShell.match(/href="\/users\/user_demo_0001"/gu)).toHaveLength(
      3,
    );
    expect(profileShell).toMatch(
      /<a class="seed-user" href="\/users\/user_demo_0001">/u,
    );
    expect(profileShell).not.toContain('class="channel-tabs"');

    expect(settingsShell.match(/href="\/settings"/gu)).toHaveLength(2);
    expect(settingsShell).not.toContain('aria-label="设置，暂未开放"');
    expect(settingsShell).toContain(
      'aria-current="page" class="top-action-link" href="/settings"',
    );
    expect(settingsShell).not.toContain('class="channel-tabs"');

    expect(notificationsShell.match(/href="\/notifications"/gu)).toHaveLength(
      2,
    );
    expect(notificationsShell).not.toContain('class="channel-tabs"');
  });

  it("marks exactly one of all five mobile primary destinations as current", () => {
    const destinations = {
      home: "/",
      markets: "/markets",
      portfolios: "/portfolios",
      profile: "/users/user_demo_0001",
      watchlist: "/watchlist",
    } as const;

    for (const [activePrimary, href] of Object.entries(destinations)) {
      const shellMarkup = renderToStaticMarkup(
        <DesktopShell
          activePrimary={activePrimary as keyof typeof destinations}
        >
          <p>页面内容</p>
        </DesktopShell>,
      );
      const mobileNavigation =
        /<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/u.exec(
          shellMarkup,
        )?.[1] ?? "";

      expect(mobileNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
      const escapedHref = href.replaceAll("/", "\\/");
      expect(mobileNavigation).toMatch(
        new RegExp(
          `<a[^>]*(?:aria-current="page"[^>]*href="${escapedHref}"|href="${escapedHref}"[^>]*aria-current="page")`,
          "u",
        ),
      );
    }
  });

  it("keeps the desktop primary navigation aligned with the active surface", () => {
    const destinations = {
      home: "/",
      markets: "/markets",
      portfolios: "/portfolios",
      watchlist: "/watchlist",
    } as const;

    for (const [activePrimary, href] of Object.entries(destinations)) {
      const shellMarkup = renderToStaticMarkup(
        <DesktopShell
          activePrimary={activePrimary as keyof typeof destinations}
        >
          <p>页面内容</p>
        </DesktopShell>,
      );
      const primaryNavigation =
        /<nav aria-label="主导航">([\s\S]*?)<\/nav>/u.exec(shellMarkup)?.[1] ??
        "";
      const escapedHref = href.replaceAll("/", "\\/");

      expect(primaryNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
      expect(primaryNavigation).toMatch(
        new RegExp(
          `<a[^>]*(?:aria-current="page"[^>]*href="${escapedHref}"|href="${escapedHref}"[^>]*aria-current="page")`,
          "u",
        ),
      );
    }
  });
});
