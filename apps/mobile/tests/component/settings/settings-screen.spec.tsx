import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  AccountSummary,
  PrivacySettings,
} from "../../../src/api/social-api";
import { SettingsScreen } from "../../../src/components/settings/settings-screen";

/*
 * 设置。
 *
 * 这一页此前只有一个活在内存里的「密度」开关。现在守的是：真设置要显示成
 * 服务端记着的那个值，做不到的事要说出来，而不是装作能做。
 */

const account: AccountSummary = {
  createdAt: "2026-08-01T00:00:00.000Z",
  displayName: "林岸",
  email: "lin@example.com",
  followerCount: 3,
  followingCount: 1,
  id: "acct_1",
  postCount: 2,
};

const privacy: PrivacySettings = {
  commentPolicy: "everyone",
  marketColors: "red-up",
  mutedCategories: [],
};

const render = (
  overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <SettingsScreen
      account={account}
      failure={null}
      onBack={vi.fn()}
      onChangePolicy={vi.fn()}
      onLogout={vi.fn()}
      onOpenSection={vi.fn()}
      onSelectColors={vi.fn()}
      onShowNotice={vi.fn()}
      onToggleCategory={vi.fn()}
      privacy={privacy}
      saving={false}
      section={null}
      {...overrides}
    />,
  );

describe("settings screen", () => {
  it("keeps the reference layout and calls the product by its own name", () => {
    const markup = render();

    expect(markup).toContain("火球账号");
    expect(markup).toContain("交易账户");
    expect(markup).toContain("功能设置");
    expect(markup).toContain("关于");
    expect(markup).not.toContain("雪球");
  });

  it("shows the setting the server is actually holding", () => {
    /*
     * 这一行的摘要要反映服务端那份，而不是恒显默认档。显示成默认的话，改过
     * 设置的人回到这一页会看到自己没改过——然后再改一次。
     */
    const off = render({
      privacy: { ...privacy, commentPolicy: "off" },
      section: "comments",
    });

    expect(off).toContain("关闭评论");
  });

  it("counts the muted categories instead of always saying all are on", () => {
    const muted = render({
      privacy: { ...privacy, mutedCategories: ["likes", "follows"] },
    });

    expect(muted).toContain("已关 2 类");
    expect(muted).not.toContain("全部接收");
  });

  it("marks a muted category as off, not on", () => {
    /*
     * 勾选状态取反是这类界面最容易写错的一处：静音列表里存的是「关掉的」，
     * 而勾选画的是「开着的」。写反了，用户关掉的那几类看起来全是开的。
     */
    const markup = render({
      privacy: { ...privacy, mutedCategories: ["likes"] },
      section: "notifications",
    });
    const repliesAt = markup.indexOf("回复我的");
    const likesAt = markup.indexOf("赞我的");

    /* 未静音的那条带勾，静音的那条不带。 */
    expect(markup.slice(repliesAt, repliesAt + 400)).toContain("✓");
    expect(markup.slice(likesAt, likesAt + 200)).not.toContain("✓");
  });

  it("hides the logout button when nobody is signed in", () => {
    expect(render({ account: null })).not.toContain(
      'data-testid="settings-logout"',
    );
    expect(render()).toContain('data-testid="settings-logout"');
  });
});
