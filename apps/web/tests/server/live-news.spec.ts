import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_LIVE_NEWS_ROWS,
  loadLiveNews,
} from "../../src/server/live-news.server";

/*
 * 7×24 快讯。
 *
 * 这一栏此前只有 SEC EDGAR 的美股申报，而且是快照——最新一条停在两天前，
 * 页面上老老实实标着「已陈旧」。一个叫 7×24 的栏目，内容两天没动过。
 *
 * 现在接的是东方财富公开快讯列表：真正的分钟级中文市场快讯。
 *
 * 三个坑，错了都不报错：
 *   1. 响应**不是 JSON**，是 `var ajaxResult={...};`。直接 JSON.parse 会抛，
 *      而抛在 try 里就变成「今天没有快讯」；
 *   2. 成功标志是 `rc:1`。行情那几个接口是 `rc:0` 表示成功——照那边的习惯
 *      判断，会把每一次成功都当成失败；
 *   3. 时间是北京时间墙钟、不带时区。当成 UTC 解析会整体前移八小时，
 *      凌晨 00:08 的快讯显示成前一天下午 16:08。
 *
 * 值是照真实结构改写的合成数据。
 */

const itemOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  digest: "示例指数跌幅扩大。",
  id: "202608143840830538",
  showtime: "2026-08-14 00:08:19",
  title: "示例指数跌幅扩大",
  url_w: "http://finance.eastmoney.com/a/202608143840830538.html",
  ...overrides,
});

/** 上游把 JSON 包在一句 JS 赋值里。 */
const bodyOf = (list: readonly unknown[], rc = 1): string =>
  `var ajaxResult=${JSON.stringify({ LivesList: list, me: "", rc })};`;

let requested = "";

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
});

describe("the response is a JS assignment, not JSON", () => {
  it("reads the payload out of the `var ajaxResult=` wrapper", async () => {
    stubUpstream(bodyOf([itemOf()]));

    const feed = await loadLiveNews();

    // 直接 JSON.parse 整个响应会抛——抛掉就成了「今天没有快讯」。
    expect(feed?.items).toHaveLength(1);
    expect(feed?.items[0]?.title).toBe("示例指数跌幅扩大");
  });

  it("refuses a body that is not that wrapper", async () => {
    // 上游改了形状时要当作取不到，而不是当作空。
    stubUpstream("<!doctype html><html>被挡住了</html>");
    expect(await loadLiveNews()).toBeNull();
  });
});

describe("loading the live feed", () => {
  it("treats rc:1 as success and anything else as failure", async () => {
    stubUpstream(bodyOf([itemOf()], 1));
    expect((await loadLiveNews())?.items).toHaveLength(1);

    /*
     * 行情那几个接口是 rc:0 表示成功，这个反过来。照那边的习惯写，
     * 会把每一次成功都判成失败——整栏永远空着。
     */
    stubUpstream(bodyOf([itemOf()], 0));
    expect(await loadLiveNews()).toBeNull();
  });

  it("keeps the Beijing wall clock instead of shifting it", async () => {
    stubUpstream(bodyOf([itemOf({ showtime: "2026-08-14 00:08:19" })]));

    const feed = await loadLiveNews();

    /*
     * 交给 new Date(...) 再格式化，在 UTC 机器上会变成 08-13 16:08——
     * 一条凌晨的快讯显示成前一天下午，而它看起来仍然是个正常时间。
     */
    expect(feed?.items[0]?.publishedAt).toBe("2026-08-14 00:08");
  });

  it("serves the article over https", async () => {
    stubUpstream(
      bodyOf([
        itemOf({ url_w: "http://finance.eastmoney.com/a/2026081438408.html" }),
      ]),
    );

    const feed = await loadLiveNews();

    // 上游给的是 http。本站是 https，照抄会被浏览器当混合内容拦掉。
    expect(feed?.items[0]?.href).toBe(
      "https://finance.eastmoney.com/a/2026081438408.html",
    );
  });

  it("hands the page plain text, never markup", async () => {
    stubUpstream(
      bodyOf([
        itemOf({
          digest: "示例<em>指数</em>跌幅扩大。",
          title: "示例<em>指数</em>跌幅扩大",
        }),
      ]),
    );

    const feed = await loadLiveNews();

    /*
     * 公告那一路会剥掉上游的 <em> 高亮标签，这一路原先不剥——同一个站里
     * 两套上游、两种净化策略，是迟早要出事的那种不一致。
     *
     * React 默认转义，所以今天不至于是 XSS；但页面上会出现一串尖括号，
     * 而且哪天有人在下游用了 dangerouslySetInnerHTML，这里就是入口。
     * 净化放在取数层，页面拿到的永远是纯文本。
     */
    expect(feed?.items[0]?.title).toBe("示例指数跌幅扩大");
    expect(feed?.items[0]?.digest).toBeNull();
    expect(JSON.stringify(feed)).not.toContain("<");
  });

  it("drops an item with nothing to show or nowhere to go", async () => {
    stubUpstream(
      bodyOf([
        itemOf(),
        itemOf({ id: "2", title: "" }),
        itemOf({ id: "3", url_w: "" }),
      ]),
    );

    expect((await loadLiveNews())?.items).toHaveLength(1);
  });

  it("does not repeat the same dispatch twice", async () => {
    stubUpstream(bodyOf([itemOf(), itemOf(), itemOf({ id: "other" })]));

    // 同一条快讯在列表里出现两次，读起来像是又发生了一次。
    expect((await loadLiveNews())?.items).toHaveLength(2);
  });

  it("clamps how many rows a caller can ask for", async () => {
    stubUpstream(bodyOf([itemOf()]));

    await loadLiveNews(100_000);

    expect(requested).toContain(`_${String(MAX_LIVE_NEWS_ROWS)}_1_`);
  });

  it("returns nothing when upstream fails or the list is empty", async () => {
    stubUpstream(null);
    expect(await loadLiveNews()).toBeNull();

    // 空列表会被读成「今天没有快讯」，那是另一回事。
    stubUpstream(bodyOf([]));
    expect(await loadLiveNews()).toBeNull();
  });
});
