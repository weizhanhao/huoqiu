import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 主页上「回复」和「收藏」不能由服务端渲染。
 *
 * 那两个页签在雪球上带锁图标，是本人可见的。此前的实现把它们随页面一起
 * 渲染给了所有人——一个人收藏过什么，等于他在关注什么、在看什么。
 *
 * 关键在于：**在组件里隐藏是不够的**。只要服务端把数据渲染进了页面，
 * 它就躺在 HTML 源码里，右键查看源代码就能读到，CSS 藏不住它。
 * 所以这条断言盯的是「页面源码里根本不出现这两个字段」，
 * 而不是「页面上看不见它们」。
 *
 * 这种回归在浏览器里完全看不出来——界面照样正常，只是数据多发了一份。
 * 所以写成断言。
 */

const profilePage = fileURLToPath(
  new URL("../../src/app/users/[userId]/page.tsx", import.meta.url),
);

const lockedTabs = fileURLToPath(
  new URL("../../src/features/account/locked-profile-tabs.tsx", import.meta.url),
);

describe("a locked profile tab never reaches the server-rendered HTML", () => {
  it("keeps replies and bookmarks out of the server component", async () => {
    const source = await readFile(profilePage, "utf8");

    /*
     * 连计数也不能有。「他收藏了 37 条」本身就泄露了活跃度，
     * 哪怕一条内容都没显示。
     */
    expect(source).not.toContain("profile.replies");
    expect(source).not.toContain("profile.bookmarks");
  });

  it("hands those two tabs to a client component instead", async () => {
    const source = await readFile(profilePage, "utf8");

    // 不是简单删掉了事——这两块仍然要给本人看，只是换成带令牌去取。
    expect(source).toContain("LockedProfileTabs");
  });

  it("keeps that client component asking with a token", async () => {
    const source = await readFile(lockedTabs, "utf8");

    /*
     * 必须走 authorizedFetch。用裸 fetch 打这个接口不会带上令牌，
     * 服务端只会回 401——那样本人也看不到自己的东西，
     * 而「上锁」会退化成「坏了」。
     */
    expect(source).toContain('"use client"');
    expect(source).toContain("authorizedFetch");
    expect(source).toContain("/api/social/profile");
  });
});
