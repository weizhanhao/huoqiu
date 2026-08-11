import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  ProfilePageExperience,
  SettingsPageExperience,
} from "../../src/features/profile-settings/profile-settings-experience";
import { ProfileSessionProvider } from "../../src/features/profile-settings/profile-session";

const renderInSession = (children: ReactNode): string =>
  renderToStaticMarkup(
    <ProfileSessionProvider>{children}</ProfileSessionProvider>,
  );

describe("synthetic profile route surface", () => {
  it("renders the allowlisted identity, disclosure, statistics, and editable profile controls", () => {
    const markup = renderInSession(<ProfilePageExperience />);

    expect(markup).toContain("火球演示用户");
    expect(markup).toContain("@huoqiu_demo");
    expect(markup).toContain("固定合成身份");
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
    expect(markup).toContain("火球演示用户");
    expect(markup).toContain("当前会话资料");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain("减少界面动效");
    expect(markup).toContain('href="/notifications"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toContain('href="/portfolios"');
  });

  it("keeps regulated and account capabilities visibly unavailable and inert", () => {
    const markup = renderInSession(<SettingsPageExperience />);

    for (const capability of [
      "账号与安全",
      "扫一扫登录 PC",
      "基金账户",
      "证券账户",
      "模拟交易",
    ]) {
      expect(markup).toContain(capability);
    }
    expect(markup.match(/disabled=""/gu)).toHaveLength(5);
    expect(markup.match(/演示环境未接入，无法操作/gu)).toHaveLength(5);
    expect(markup).not.toContain("扫码登录");
  });
});
