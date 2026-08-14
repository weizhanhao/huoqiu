import { describe, expect, it } from "vitest";

import { activeNavHref } from "../../../src/components/shell/active-nav";

/*
 * 侧栏选中态由地址决定。
 *
 * 原先是各页往壳里传参数：/markets/rankings 传的是 "markets"，于是人站在
 * 涨跌榜上，点亮的是「行情」。用户的原话是「点了页面过去了，但是导航栏的
 * 选中状态并不是选中的页面」。
 *
 * 这类错不报任何异常——高亮只是落在别处，而写页面的人多半不会回头看侧栏。
 * 所以判定必须从地址推，且要在这里测透。
 */

/* 侧栏实际的那一组地址，顺序照抄，好让「取最长」这件事真的被考到。 */
const SIDEBAR = [
  "/",
  "/watchlist",
  "/markets",
  "/markets/rankings",
  "/screener",
  "/funds",
  "/etfs",
  "/private-funds",
  "/portfolios",
  "/trade",
  "/bookmarks",
  "/studio",
  "/notifications",
  "/messages",
  "/settings",
];

describe("which sidebar entry is current", () => {
  it("picks the deepest match, not the first one", () => {
    /*
     * 这一条就是用户看到的那个 bug：/markets 与 /markets/rankings 都匹配，
     * 按短的算会点亮「行情」，正确答案是「涨跌榜」。
     */
    expect(activeNavHref("/markets/rankings", SIDEBAR)).toBe(
      "/markets/rankings",
    );
    expect(activeNavHref("/markets", SIDEBAR)).toBe("/markets");
  });

  it("keeps a child page on its section", () => {
    // 基金详情页仍然算在「基金」上，不该什么都不亮。
    expect(activeNavHref("/funds/011103", SIDEBAR)).toBe("/funds");
    expect(activeNavHref("/portfolios/pf_001", SIDEBAR)).toBe("/portfolios");
    expect(activeNavHref("/studio/drafts/article", SIDEBAR)).toBe("/studio");
  });

  it("only matches at a path boundary", () => {
    /*
     * 纯前缀匹配会让 /marketsplace 点亮「行情」。这类地址今天没有，
     * 但加一条新路由时不该顺手点亮一个不相干的项。
     */
    expect(activeNavHref("/marketsplace", SIDEBAR)).toBeNull();
    expect(activeNavHref("/watchlist-archive", SIDEBAR)).toBeNull();
  });

  it("does not let the home entry swallow every page", () => {
    // "/" 是所有地址的前缀；按前缀算的话每一页都会点亮首页。
    expect(activeNavHref("/", SIDEBAR)).toBe("/");
    expect(activeNavHref("/funds", SIDEBAR)).toBe("/funds");
  });

  it("ignores the query string and the trailing slash", () => {
    /*
     * 消息中心的四个分类共用「消息」这一条。要分别点亮就得读查询串，
     * 而那会让每一个套着本壳的静态页退出预渲染——不值当。
     */
    expect(activeNavHref("/notifications?category=replies", SIDEBAR)).toBe(
      "/notifications",
    );
    expect(activeNavHref("/funds/", SIDEBAR)).toBe("/funds");
  });

  it("returns null for a page that is not in the sidebar", () => {
    /*
     * 个股页走的是自己的外壳，侧栏里没有它。这时什么都不亮是对的——
     * 随便挑一条亮起来，等于告诉用户他在别的地方。
     */
    expect(activeNavHref("/instruments/sh600519", SIDEBAR)).toBeNull();
  });
});
