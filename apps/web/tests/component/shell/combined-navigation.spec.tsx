import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";

/* 频道选中态由地址决定，所以这里设定地址而不是传参。 */
const channelMarkup = (pathname: string): string => {
  currentPathname = pathname;
  const shellMarkup = renderToStaticMarkup(
    <DesktopShell>
      <p>页面内容</p>
    </DesktopShell>,
  );

  return (
    /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      shellMarkup,
    )?.[1] ?? ""
  );
};

const mobileMarkup = (pathname: string): string => {
  currentPathname = pathname;
  const shellMarkup = renderToStaticMarkup(
    <DesktopShell>
      <p>页面内容</p>
    </DesktopShell>,
  );

  return (
    /<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      shellMarkup,
    )?.[1] ?? ""
  );
};

const utilityShellMarkup = (pathname: string): string => {
  currentPathname = pathname;
  return renderToStaticMarkup(
    <DesktopShell activeUtility="profile">
      <p>页面内容</p>
    </DesktopShell>,
  );
};

/*
 * 导航选中态现在由地址决定，不再由页面传 activePrimary——原先那个参数
 * /markets/rankings 传成了 "markets"，人站在涨跌榜上点亮的是「行情」。
 * 所以这里改成设定地址，而不是传参数。
 */
let currentPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("combined profile and finance navigation", () => {
  it("gives 7x24 and news distinct deep links with exactly one current channel", () => {
    const briefingChannels = channelMarkup("/7x24");
    const newsChannels = channelMarkup("/news");

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
    /*
     * 消息、设置、个人主页在移动端都归到「我的」底下——底栏只有五格，
     * 这三页各占一格的话，行情类入口就得让位。
     */
    for (const pathname of [
      "/notifications",
      "/users/acct_demo",
      "/settings",
    ]) {
      const mobileNavigation = mobileMarkup(pathname);

      expect(mobileNavigation.match(/<a\b/gu)).toHaveLength(5);
      // 未登录态的「我的」落到 /login，不再写死内置样本用户。
      expect(mobileNavigation).toContain('href="/login"');
      expect(mobileNavigation).toContain("<span>我的</span>");
      /*
       * 这里原先断言的是 `aria-label="5 条未读通知"`——把一个编出来的数字
       * 钉成了规格。那个 5 来自通知状态的默认样本（「北岸观察员回复了你的
       * 讨论」之类），一件都没发生过，却出现在每一页的顶栏和底栏上。
       *
       * 现在默认没有通知，徽标就不该出现。有几条未读由真实通知决定，
       * 那由 tests/notifications/ 覆盖。
       */
      expect(mobileNavigation).not.toContain("条未读通知");
      expect(mobileNavigation).not.toContain('href="/notifications"');
      /*
       * 这三页都归在「我的」这一格下，所以点亮的都是它；未登录时它的
       * 链接落在 /login。
       */
      expect(mobileNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
      expect(mobileNavigation).toMatch(
        /<a aria-current="page"[^>]*href="\/login"/u,
      );
    }
  });

  it("exposes profile and settings as real desktop utility routes", () => {
    const profileShell = utilityShellMarkup("/users/acct_demo");
    const settingsShell = utilityShellMarkup("/settings");
    const notificationsShell = utilityShellMarkup("/notifications");

    /*
     * 三处「我的」入口——侧栏身份区、侧栏「我的主页」、移动端底栏——
     * 过去全部写死指向 /users/user_demo_0001。身份区先改成了跟随真实账号，
     * 另外两处却留在原地，于是这条断言一度停在「还剩 2 处」。
     *
     * 那正是修一半的样子：注册了真实账号的人点「我的主页」，落到的是内置
     * 样本用户的页面，地址栏上还写着 demo。现在三处共用同一套落点规则，
     * 计数归零，并且这条断言会挡住任何把写死 id 加回外壳的改动。
     */
    expect(profileShell).not.toContain("/users/user_demo_0001");
    // 未登录时身份区必须是一条通往登录页的真链接，不能是点了没反应的死块。
    expect(profileShell).toMatch(/<a class="seed-user" href="\/login">/u);
    expect(profileShell).toContain('class="channel-tabs"');

    expect(settingsShell.match(/href="\/settings"/gu)).toHaveLength(2);
    expect(settingsShell).not.toContain('aria-label="设置，暂未开放"');
    expect(settingsShell).toContain(
      'aria-current="page" class="top-action-link" href="/settings"',
    );
    expect(settingsShell).toContain('class="channel-tabs"');

    /*
     * 顶栏 1 + 侧栏消息 1 + 侧栏二级项 4（回复 / @我 / 赞与收藏 / 系统消息）。
     * 那四条现在各带 ?category= 直达对应分类，不再全部落到默认视图，
     * 所以正则放宽到允许查询串；六个入口本身没有变。
     */
    expect(
      notificationsShell.match(/href="\/notifications(?:\?[^"]*)?"/gu),
    ).toHaveLength(6);
    expect(notificationsShell).toContain(
      'href="/notifications?category=system"',
    );
    expect(notificationsShell).toContain('class="channel-tabs"');
  });

  it("marks exactly one of all five mobile primary destinations as current", () => {
    const destinations = {
      home: "/",
      markets: "/markets",
      portfolios: "/portfolios",
      // 未登录态落点；已登录时这一项会变成 /users/<本人账号 id>。
      profile: "/login",
      watchlist: "/watchlist",
    } as const;

    for (const [, href] of Object.entries(destinations)) {
      /* 「我的」未登录时落在 /login，但地址是 /users/<id> 才算停在它上面。 */
      currentPathname = href === "/login" ? "/users/acct_demo" : href;
      const shellMarkup = renderToStaticMarkup(
        <DesktopShell>
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
      bookmarks: "/bookmarks",
      home: "/",
      markets: "/markets",
      /*
        涨跌榜是这次出问题的那一条：它在 /markets 之下，按短前缀算会把
        「行情」点亮，而人明明站在涨跌榜上。
      */
      rankings: "/markets/rankings",
      portfolios: "/portfolios",
      studio: "/studio",
      watchlist: "/watchlist",
    } as const;

    for (const [, href] of Object.entries(destinations)) {
      currentPathname = href;
      const shellMarkup = renderToStaticMarkup(
        <DesktopShell>
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
