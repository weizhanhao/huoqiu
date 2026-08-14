import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import InstrumentLayout from "../../../src/app/instruments/[listingId]/layout";
import HomePage from "../../../src/app/page";
import SearchPage from "../../../src/app/search/page";
import WatchlistPage from "../../../src/app/watchlist/page";
import {
  normalizeD0FixtureState,
  retryD0FixtureState,
} from "../../../src/lib/d0-page-state";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

describe("D0 Web runtime state injection", () => {
  it.each([
    ["normal", "normal"],
    ["loading", "loading"],
    ["empty", "empty"],
    ["error", "error"],
    [["loading", "error"], "loading"],
    ["unknown", "normal"],
    [undefined, "normal"],
  ] as const)("normalizes %j to %s", (value, expected) => {
    expect(normalizeD0FixtureState(value)).toBe(expected);
  });

  it("renders a browser-addressable loading state on the feed", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({ fixture_state: "loading" }),
      }),
    );

    expect(markup).toContain("正在加载");
    expect(markup).not.toContain("合成市场的第一份观察");
  });

  it("says the upstream is down instead of saying there are no matches", async () => {
    /*
     * 这条用例原先断言 ?fixture_state=error 会渲染一句「演示搜索暂时不可用」。
     * 那是给 D0 夹具搜索准备的模拟错误——而那套搜索搜「茅台」一条都搜不到，
     * 搜出来的是虚构的「星海智造」，点进去 404。现在这一页走的是真实的证券
     * 代码表，失败状态也就跟着变成真的：上游没答应就说取不到。
     *
     * 「没有找到」和「取不到」必须分开。混为一谈，用户会把上游故障读成
     * 「这只股票不存在」，然后再也不搜了。
     */
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));

    const markup = renderToStaticMarkup(
      await SearchPage({
        searchParams: Promise.resolve({ q: "茅台" }),
      }),
    );

    expect(markup).toContain("暂时取不到");
    expect(markup).not.toContain("没有找到匹配的标的");
  });

  it("404s an instrument this site cannot price", async () => {
    /*
     * 这条用例原先验的是 ?fixture_state=empty 那个演示空态。它模拟的是
     * 样本标的的空数据，而样本标的已经没有了——真实行情取不到时由取数层
     * 如实反映，不需要模拟一个。
     *
     * 现在验的是它的替代行为：认不出来的代码就是 404，不是
     * 「暂无演示标的详情」——后者会让人以为过几天再来就有了。
     *
     * 校验在 layout 里、不在 page 里——notFound() 落到 loading 边界之下
     * 会用 200 送出 404 页面。所以这条对 layout 断言。
     */
    await expect(
      InstrumentLayout({
        children: null,
        params: Promise.resolve({ listingId: "listing_syn_0001" }),
      }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
  });

  it("renders a browser-addressable error state on watchlist", async () => {
    const page = await WatchlistPage({
      searchParams: Promise.resolve({ fixture_state: "error" }),
    });
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        {page}
      </D0WatchlistProvider>,
    );

    expect(markup).toContain("演示自选暂时不可用");
    expect(markup).toMatch(/role="alert"[\s\S]*重试/u);
    expect(markup).not.toContain('class="watchlist-table-wrap"');
  });

  it("removes fixture_state on retry and preserves the rest of the URL", () => {
    const assign = vi.fn();
    const reload = vi.fn();

    retryD0FixtureState({
      assign,
      href: "http://127.0.0.1:3000/search?q=SYN001&fixture_state=error",
      reload,
    });

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/search?q=SYN001",
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a non-injected transient error instead of leaving a dead button", () => {
    const assign = vi.fn();
    const reload = vi.fn();

    retryD0FixtureState({
      assign,
      href: "http://127.0.0.1:3000/",
      reload,
    });

    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
