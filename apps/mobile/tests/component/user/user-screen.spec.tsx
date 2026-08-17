import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UserProfile } from "../../../src/api/social-api";
import { UserScreen } from "../../../src/components/user/user-screen";

/*
 * 别人的主页。
 *
 * 守两件事：不要把只有本人能看的东西画上去；不要在自己的主页上给自己一个
 * 关注按钮。
 */

const profile: UserProfile = {
  bio: "只记录事实，再写判断。",
  displayName: "林岸",
  followerCount: 12,
  followingCount: 5,
  id: "acct_1",
  isRegisteredAccount: true,
  joinedLabel: "2026/08/01 注册",
  postCount: 2,
  posts: [
    {
      body: "季报读完了，先不动。",
      href: "/community/posts/post_1",
      id: "post_1",
      publishedLabel: "2026/08/17",
      title: "季报读后",
    },
  ],
  role: "注册用户",
};

const render = (
  overrides: Partial<Parameters<typeof UserScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <UserScreen
      failure={null}
      following={false}
      onBack={vi.fn()}
      onOpenPost={vi.fn()}
      onToggleFollow={vi.fn()}
      profile={profile}
      {...overrides}
    />,
  );

describe("user screen", () => {
  it("shows who this is and what they have written", () => {
    const markup = render();

    expect(markup).toContain("林岸");
    expect(markup).toContain("只记录事实");
    expect(markup).toContain("季报读后");
    expect(markup).toContain("12");
  });

  it("leaves out the tabs only the owner may see", () => {
    /*
     * 收藏和回复只有本人看得到（服务端对他人直接回 403）。画上页签点开永远是
     * 空的，比不画更像是坏了——而且会让人以为是自己没权限，其实是根本没做。
     */
    const markup = render();

    expect(markup).not.toContain("收藏");
    expect(markup).not.toContain("回复");
  });

  it("hides the follow button on your own page", () => {
    /*
     * 认 testID，不认「关注」两个字：这一页的三个数字里就有一个叫「关注」，
     * 在整页里搜字面量的话，这条用例无论按钮在不在都会通过。
     */
    const mine = render({ following: null });
    const theirs = render({ following: false });

    expect(theirs).toContain('data-testid="user-follow"');
    expect(mine).not.toContain('data-testid="user-follow"');
  });

  it("does not render an empty frame while the profile is loading", () => {
    const loading = render({ profile: null });
    const broken = render({ failure: "连不上服务器。", profile: null });

    expect(loading).toContain("正在读取");
    expect(broken).toContain("连不上服务器");
  });
});
