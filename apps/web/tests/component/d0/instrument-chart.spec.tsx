import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import InstrumentLayout from "../../../src/app/instruments/[listingId]/layout";
import InstrumentPage from "../../../src/app/instruments/[listingId]/page";
import { PriceChart } from "../../../src/components/instrument/price-chart";
import { QuoteHeader } from "../../../src/components/instrument/quote-header";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { loadKlineSnapshot } from "../../../src/features/real-finance/kline.server";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 instrument detail", () => {
  /*
   * 这条路由此前还渲染 D0 夹具与 35 个虚构公司，配着编造的价格与讨论。
   * 现在只剩真实标的：快照里的那几个走快照，其余按代码现取，
   * 认不出来的代码一律 404。
   *
   * 这里断言真实标的仍然渲染出完整详情——删虚构分支时不该把真的一起删掉。
   */
  it("serves the full detail for a real listing", async () => {
    const snapshot = loadKlineSnapshot();
    const symbol = snapshot?.series[0]?.symbol;
    if (symbol === undefined) throw new Error("需要一个真实标的快照");

    /*
     * 外壳住在 layout 里，所以「这条地址上有什么」= layout ∘ page。
     * 只渲染 page 的话，标题、加自选、分区导航都不在，测的就不是这条路由。
     */
    const params = Promise.resolve({ listingId: symbol });
    const page = await InstrumentPage({ params });
    const shell = await InstrumentLayout({ children: page, params });
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={[symbol]}>
        {shell}
      </D0WatchlistProvider>,
    );

    expect(markup).toContain(snapshot?.series[0]?.name ?? "");
    expect(markup).toContain("区间统计");
  });

  it("404s a listing this site cannot price", async () => {
    // 虚构标的没有了；认不出来的代码就是 404，不是「暂无演示标的详情」。
    /*
     * 校验在 layout 里，不在 page 里——notFound() 落到 loading 边界之下
     * 会用 200 送出 404 页面。所以这条要对 layout 断言：page 单独渲染
     * 已经不会抛了，那不是回归，是校验上移了一层。
     */
    await expect(
      InstrumentLayout({
        children: null,
        params: Promise.resolve({ listingId: "listing_syn_0001" }),
      }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
  });

  it("discloses quote identity, market metadata, source, and snapshot", () => {
    const fixture = readyFixture();
    const instrument = fixture.instruments[0];
    const quote = fixture.quotes[0];
    if (instrument === undefined || quote === undefined) {
      throw new Error("Expected one synthetic listing and quote");
    }

    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={[instrument.listing_id]}>
        <QuoteHeader instrument={instrument} quote={quote} />
      </D0WatchlistProvider>,
    );

    expect(markup).toContain("星海智造");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain("CN · CNY · 交易中");
    expect(markup).toContain("huoqiu-synthetic");
    expect(markup).toContain("2026-08-08T06:00:00.000Z");
    // 页头数据徽标已从「演示数据 · 合成数据」改为「样本数据 · 非实时」。
    // 要守的是「行情头必须带可见的来源标注」，这一点没变。
    expect(markup).toContain("样本数据");
  });

  it("renders an accessible 20-point synthetic candlestick chart", () => {
    const fixture = readyFixture();
    const series = fixture.bars[0];
    if (series === undefined) {
      throw new Error("Expected one synthetic bar series");
    }

    const markup = renderToStaticMarkup(
      <PriceChart
        instrumentName="星海智造"
        points={series.points}
        state="normal"
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain("星海智造 20 个日 K 点");
    expect(markup.match(/data-bar-index=/gu)).toHaveLength(20);
    expect(markup).toContain("2026-07-20");
    expect(markup).toContain("2026-08-08");
    expect(markup).toContain("成交量");
  });

  it("does not draw a fabricated chart for empty or error states", () => {
    const emptyMarkup = renderToStaticMarkup(
      <PriceChart instrumentName="星海智造" points={[]} state="normal" />,
    );
    const errorMarkup = renderToStaticMarkup(
      <PriceChart instrumentName="星海智造" points={[]} state="error" />,
    );

    expect(emptyMarkup).toContain("暂无日 K 数据");
    expect(emptyMarkup).not.toContain("<svg");
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).not.toContain("<svg");
  });
});
