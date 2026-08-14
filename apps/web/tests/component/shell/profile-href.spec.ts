import { describe, expect, it } from "vitest";

import { profileHref } from "../../../src/components/shell/profile-navigation-link";

/*
 * 「我的」入口的落点。
 *
 * 三处入口（侧栏身份区、侧栏「我的主页」、移动端底栏）过去都写死指向内置
 * 样本用户。身份区先被改成跟随真实账号，另外两处留在原地——于是注册了真实
 * 账号的人点「我的主页」，落到的是别人的页面，地址栏上还写着 demo。
 *
 * 外壳的渲染测试只能覆盖未登录态（服务端渲染拿不到客户端会话），所以真正
 * 出问题的那一半在这里守。
 */
describe("profile navigation destination", () => {
  it("points at the signed-in account's own profile", () => {
    expect(profileHref({ id: "acct_0a1b2c3d4e5f6a7b" })).toBe(
      "/users/acct_0a1b2c3d4e5f6a7b",
    );
  });

  it("sends signed-out visitors to login instead of a stand-in profile", () => {
    expect(profileHref(null)).toBe("/login");
  });

  it("never falls back to a built-in sample account", () => {
    for (const account of [null, { id: "acct_0a1b2c3d4e5f6a7b" }]) {
      expect(profileHref(account)).not.toContain("user_demo_0001");
    }
  });
});
