import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstrumentLayout from "../../src/app/instruments/[listingId]/layout";
import InstrumentPage from "../../src/app/instruments/[listingId]/page";
import WatchlistPage from "../../src/app/watchlist/page";
import { loadKlineSnapshot } from "../../src/features/real-finance/kline.server";
import { createPost, registerAccount } from "../../src/server/social-store";
import { D0WatchlistProvider } from "../../src/stores/d0-watchlist";

/*
 * 真实标的的详情页。
 *
 * 快照里的 8 个标的过去只在 /markets 排成一列，点不进去——全站唯一的真实
 * 行情反而是唯一没有自己页面的东西。这条路由此前只认识 35 个虚构标的。
 *
 * 快照缺失时不跳过、直接失败：那正是这条路由退化回「只剩虚构标的」的状态，
 * 而这恰恰是本用例要防的事。
 */
const snapshot = loadKlineSnapshot();

/*
 * 自选清单由根布局提供，这里照做——真实标的现在也带自选按钮，
 * 不包 Provider 渲染会直接抛错。
 */
const knownListingIds = [
  "listing_syn_0001",
  ...(snapshot?.series ?? []).map((series) => series.symbol),
];

/*
 * 渲染 layout 包着 page，而不是单渲染 page。
 *
 * 外壳（顶栏、分区导航、标题行、加自选、右栏）住在 layout 里——放在
 * page 里的话，每切一次分区都是一组全新的 DOM 节点，位置就会跳。
 * 所以「用户在这条地址上看到什么」= layout ∘ page，只渲染其中一半，
 * 测的就不是这条路由。
 */
const renderInstrument = async (listingId: string): Promise<string> => {
  const params = Promise.resolve({ listingId });
  const page = await InstrumentPage({
    params,
    searchParams: Promise.resolve({}),
  });
  const shell = await InstrumentLayout({ children: page, params });
  return renderToStaticMarkup(
    <D0WatchlistProvider knownListingIds={knownListingIds}>
      {shell}
    </D0WatchlistProvider>,
  );
};

describe("real instrument detail route", () => {
  it("has a real kline snapshot to serve", () => {
    expect(snapshot).not.toBeNull();
    expect(snapshot?.series.length ?? 0).toBeGreaterThan(0);
  });

  it("renders every real symbol with its own detail page", async () => {
    for (const series of snapshot?.series ?? []) {
      const markup = await renderInstrument(series.symbol);

      expect(markup).toContain(series.name);
      expect(markup).toContain(series.symbol);
      // 区间统计是这一页相对 /markets 的增量，缺了就说明走错了分支。
      expect(markup).toContain("区间统计");
      expect(markup).toContain("日均成交量");
      // 真实标的过去加不进自选：自选清单只认识夹具标的和虚构标的。
      expect(markup).toContain("加自选");
    }
  });

  it("keeps the sample-data disclaimer off real instruments", async () => {
    const first = snapshot?.series[0];
    expect(first).toBeDefined();
    const markup = await renderInstrument(first?.symbol ?? "");

    /*
     * 虚构标的那一页写的是「合成数据」。把这套说明套到真实日线上会把真数据
     * 说成假的；反过来，抹掉来源标注又会把公开接口的快照说成实时行情。
     * 两个方向都是失真，所以正反各钉一条。
     *
     * 来源这一条原先断言的是快照里的 source（新浪）。图表改成按周期现取
     * 之后，画出来的数据来自腾讯，再断言新浪就是在核对一个已经不成立的
     * 出处。要守的东西没变：这一页必须说清楚图是谁给的、是不是实时。
     */
    expect(markup).not.toContain("合成数据");
    expect(markup).toContain("非实时");
    expect(markup).toContain("腾讯财经公开行情接口");
  });

  it("shows a watchlisted real symbol instead of silently dropping it", async () => {
    const symbol = snapshot?.series[0]?.symbol ?? "";
    const page = await WatchlistPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider
        initialListingIds={[symbol]}
        knownListingIds={knownListingIds}
      >
        {page}
      </D0WatchlistProvider>,
    );

    /*
     * 自选面板解析 id 用的是 flatMap，认不出就返回空数组——加得进去、
     * 列表里却没有，用户完全无从判断是没加上还是加错了。
     */
    expect(markup).toContain(snapshot?.series[0]?.name ?? "");
  });

  it("no longer serves the fictional listings", async () => {
    /*
     * 这条路由此前还渲染 35 个虚构公司（星海智造、远望全球……），
     * 配着编造的价格、资讯和讨论——一个真实代码和一个虚构公司共用同一条
     * 地址，从地址栏上分不出哪个是真的。现在只剩真实标的。
     */
    for (const listingId of ["listing_syn_0001", "listing_syn_0002"]) {
      await expect(
        renderInstrument(listingId),
        listingId,
      ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
    }
  });
});

/*
 * 讨论区要读得回来。
 *
 * 这一块此前只有一个发帖框：话说出去，在这一页上再也看不到，别人说了什么
 * 更无从得知。只能写不能读的讨论区，不是讨论区。
 *
 * 存储目录整体重定向到临时目录——真实库里有已注册的账号和真帖子，
 * 测试绝不能碰。
 */
describe("the discussion under a real instrument reads back", () => {
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(resolve(tmpdir(), "huoqiu-instrument-talk-"));
    vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("shows what people said about this symbol, and not about another one", async () => {
    const symbols = (snapshot?.series ?? []).map((series) => series.symbol);
    const [subject, other] = symbols;
    if (subject === undefined || other === undefined) {
      throw new Error("需要至少两个真实标的才能验证讨论没有串台");
    }

    const account = registerAccount({
      displayName: "张远",
      email: "instrument-talk@example.com",
      now: "2026-08-13T00:00:00.000Z",
      password: "Correct-Horse-9",
    });
    if ("error" in account) throw new Error(account.error);

    for (const [symbol, said] of [
      [subject, "这句话必须出现在讨论区"],
      [other, "这句话属于另一只标的"],
    ] as const) {
      const post = createPost({
        accountId: account.account.id,
        body: `$${symbol}$ ${said}`,
        now: "2026-08-13T01:00:00.000Z",
        title: "讨论",
      });
      if ("error" in post) throw new Error(post.error);
    }

    const markup = await renderInstrument(subject);

    expect(markup).toContain("这句话必须出现在讨论区");
    expect(markup).toContain("张远");
    /*
     * 别的标的下的话不该出现在这里。串台之后两只毫不相干的标的共用一个
     * 讨论区，而界面上完全看不出来。
     */
    expect(markup).not.toContain("这句话属于另一只标的");
  });

  it("says plainly that nobody has spoken yet", async () => {
    const subject = (snapshot?.series ?? [])[0]?.symbol;
    if (subject === undefined) throw new Error("需要一个真实标的");

    const markup = await renderInstrument(subject);

    // 空白一块会让人以为没加载出来，而不是「还没有人说过」。
    expect(markup).toContain("还没有人讨论过这只标的");
  });
});
