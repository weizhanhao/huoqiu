import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import SettingsLayout from "../../src/app/settings/layout";
import SettingsPage from "../../src/app/settings/page";
import SyntheticUserProfilePage from "../../src/app/users/user_demo_0001/page";
import {
  ProfilePageExperience,
  SettingsPageExperience,
} from "../../src/features/profile-settings/profile-settings-experience";
import { ProfileSessionProvider } from "../../src/features/profile-settings/profile-session";

const renderInSession = (children: ReactNode): string =>
  renderToStaticMarkup(
    <ProfileSessionProvider>{children}</ProfileSessionProvider>,
  );

/*
 * 导航选中态由地址决定（见 src/components/shell/active-nav.ts），
 * 所以这里设定地址再渲染，而不是往壳里传参数。
 */
let currentPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("synthetic profile route surface", () => {
  it("renders the allowlisted identity, disclosure, statistics, and editable profile controls", () => {
    const markup = renderInSession(<ProfilePageExperience />);

    expect(markup).toContain("火球演示用户");
    expect(markup).toContain("@huoqiu_demo");
    expect(markup).toContain("固定样本身份");
    expect(markup).toContain("12 动态");
    expect(markup).toContain("38 收藏");
    expect(markup).toContain("24 关注");
    expect(markup).toContain("186 粉丝");
    expect(markup).toContain("编辑资料");
    expect(markup).toContain("恢复固定资料");
    expect(markup).toContain('href="/settings"');
  });

  it("exposes activity, favorites, and following as an APG tab interface", () => {
    const markup = renderInSession(<ProfilePageExperience />);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="用户主页内容"');
    for (const label of ["动态", "收藏", "关注"]) {
      expect(markup).toContain(`role="tab"`);
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain("本周公开数据观察清单");
  });
});

describe("synthetic settings route surface", () => {
  it("shows session statistics, reduced-motion preference, and real product links", () => {
    const markup = renderInSession(<SettingsPageExperience />);

    expect(markup).toContain("设置");
    /*
     * 这两条原先断言设置页顶部必须出现「火球演示用户 / 当前会话资料」——
     * 把一份写死的身份钉成了规格。那块资料跟谁登录了没有关系，真实账号
     * 打开设置页看到的也是「火球演示用户」，动态 12、收藏 38、关注 24。
     *
     * 现在它取真实账号；未登录就说未登录。演示身份仍然只出现在
     * /users/user_demo_0001 那一页（上面那个 describe 覆盖）。
     */
    expect(markup).not.toContain("火球演示用户");
    expect(markup).toContain("当前账号");
    expect(markup).toContain("未登录");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain("减少界面动效");
    expect(markup).toContain('href="/notifications"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toContain('href="/portfolios"');
  });

  it("keeps regulated and account capabilities visibly unavailable and inert", () => {
    const markup = renderInSession(<SettingsPageExperience />);

    /*
     * 「模拟交易」曾在这份不可用清单里，和证券开户并排。那个前提是错的：
     * 模拟盘不碰真实资金、不下真实委托，不需要牌照——它现在已经在组合详情页
     * 实现。清单里只保留真正受牌照限制的项。
     */
    for (const capability of [
      "账号与安全",
      "扫一扫登录 PC",
      "基金账户",
      "证券账户",
    ]) {
      expect(markup).toContain(capability);
    }
    /*
     * 「模拟交易」现在是一个真实可用的入口（/trade：真实行情成交、按账号
     * 隔离的持仓与流水），所以它出现在页面上是对的——但绝不能出现在下面
     * 那份「受牌照限制、不可用」的清单里。这一条守的是后者。
     */
    expect(markup).toContain('href="/trade"');
    const unavailableList =
      /<section[^>]*aria-labelledby="unavailable-settings-heading"[\s\S]*?<\/section>/u.exec(
        markup,
      )?.[0] ?? "";
    expect(unavailableList).not.toContain("模拟交易");
    expect(markup.match(/disabled=""/gu)).toHaveLength(4);
    // 同上：模拟交易已实现并移出清单，剩下四项都是真正受牌照限制的。
    expect(markup.match(/演示环境未接入，无法操作/gu)).toHaveLength(4);
    expect(markup).not.toContain("扫码登录");
  });
});

describe("profile and settings shell navigation", () => {
  it("marks each utility route current without rendering the global channels", () => {
    currentPathname = "/users/user_demo_0001";
    const profileMarkup = renderInSession(<SyntheticUserProfilePage />);
    /*
     * 设置页现在由 app/settings/layout.tsx 提供外壳与八项导航，页面本身只负责
     * 「个人资料」那一项的内容。所以这里按 Next 的实际组合方式渲染——单独渲染
     * 页面组件已经拿不到外壳，那不是回归，是结构变了。
     */
    currentPathname = "/settings";
    const settingsMarkup = renderInSession(
      <SettingsLayout>
        <SettingsPage />
      </SettingsLayout>,
    );

    // 频道栏现在在所有页面都渲染：之前工具页把它摘掉，导致从别处点进来时
    // 主列内容整体上跳 52px，跳完又"恢复正常"，正是要消除的抖动。
    expect(profileMarkup).toContain('class="channel-tabs"');
    /*
     * 「我的」入口已改为跟随真实账号，服务端渲染的是未登录态，落点为 /login。
     * 断言本意没变：处于 profile 工具页时，「我的」那一条必须被标为当前页。
     */
    expect(profileMarkup).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/login"[^>]*>/u,
    );
    expect(settingsMarkup).toContain('class="channel-tabs"');
    expect(settingsMarkup).toContain(
      'aria-current="page" class="top-action-link" href="/settings"',
    );
  });
});
