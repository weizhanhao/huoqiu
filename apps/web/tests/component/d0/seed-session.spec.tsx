import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import {
  d0WatchlistInitialState,
  d0WatchlistReducer,
} from "../../../src/stores/d0-watchlist";

describe("D0 Web seed session", () => {
  it("renders the fixture identity, preserved routes, and product navigation", () => {
    const markup = renderToStaticMarkup(
      <DesktopShell>
        <p>内容</p>
      </DesktopShell>,
    );

    expect(markup).toContain("演示用户");
    expect(markup).toContain("内容");
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toContain('action="/search"');
    /*
     * 外壳里那块「市场快照」删掉了：它列的是虚构标的（星海智造 SYN001…），
     * 涨跌色和正号还写死成上涨。市场概览现在是指数条上的沪深三大指数。
     */
    expect(markup).not.toContain("星海智造");
    expect(markup).toContain("上证指数");
    /*
     * 「本地会话数据，刷新后重置」这句话已经不成立了：账号、帖子、评论、
     * 消息、资料和组合都跟着账号落盘。对着一个刚改完资料的人说「刷新后
     * 重置」，是在让他白改一遍。真正只活在本次会话里的只剩自选。
     */
    expect(markup).not.toContain("本地会话数据，刷新后重置");
    /*
     * 这条说明原先挂在侧栏底部，于是**每一页**都在讲一件只跟自选页有关的事，
     * 是全站曝光量最大的一条工程说明。现在它回到自选页本身（见
     * watchlist-panel），外壳不再重复。
     */
    expect(markup).not.toContain("自选刷新后重置");
    expect(markup).toContain("基金");
    expect(markup).toContain("组合");
    expect(markup).toContain("消息");
    /*
     * 壳层里的入口叫「发帖」不叫「发布」：它弹出一个写短帖的框，
     * 而「发布」在创作者中心另有所指（发布长文）。同一个词指两件事，
     * 用户会以为点它能写长文。
     */
    expect(markup).toContain("发帖");
    /*
     * 创作者中心得在左栏点得到。草稿箱、内容管理、数据中心都做好了，
     * 却一度只能直接敲地址才进得去——那等于没做。
     */
    expect(markup).toContain("创作者中心");
    // 壳层的 11 个频道已全部做实，不再有「暂未开放」占位。
    // 这里改为守住真正的底线：壳层里不能出现无 href 的死链接
    // ——那才是 yaoqiu.md 禁止的「用无响应按钮冒充完成」。
    // `(?=[\s>])` 是必需的：没有它，`<a` 会先匹配到 `<aside` / `<article`。
    expect(markup).not.toMatch(/<a(?=[\s>])(?![^>]*\bhref=)[^>]*>/u);
    expect(markup).not.toContain("私募认购");
    expect(markup).not.toContain("开户");
    expect(markup).not.toContain("交易下单");
  });

  it("parses the shared fixture once into an explicit ready result", () => {
    const result = loadD0Fixture();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.data.version).toBe("d0.v1");
      expect(result.data.instruments[0]?.listing_id).toBe("listing_syn_0001");
      expect(result.data.watchlist).toEqual({
        persistence: "session-only",
        listing_ids: [],
      });
    }
  });

  it("keeps watchlist changes idempotent, ordered, and resettable", () => {
    const once = d0WatchlistReducer(d0WatchlistInitialState, {
      type: "add",
      listingId: "listing_syn_0001",
    });
    const twice = d0WatchlistReducer(once, {
      type: "add",
      listingId: "listing_syn_0001",
    });
    const withSecond = d0WatchlistReducer(twice, {
      type: "add",
      listingId: "listing_syn_0002",
    });

    expect(twice.listingIds).toEqual(["listing_syn_0001"]);
    expect(withSecond.listingIds).toEqual([
      "listing_syn_0001",
      "listing_syn_0002",
    ]);
    expect(
      d0WatchlistReducer(withSecond, {
        type: "remove",
        listingId: "listing_syn_0001",
      }).listingIds,
    ).toEqual(["listing_syn_0002"]);
    expect(d0WatchlistReducer(withSecond, { type: "reset" })).toEqual(
      d0WatchlistInitialState,
    );
  });
});
