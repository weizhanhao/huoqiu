import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import RootLayout from "../../../src/app/layout";
import { isWatchableSymbol } from "../../../src/lib/watchlist-symbol";
import { WatchlistPanel } from "../../../src/components/watchlist/watchlist-panel";
import { WatchlistToggle } from "../../../src/components/watchlist/watchlist-toggle";
import { WatchlistWorkspace } from "../../../src/components/watchlist/watchlist-workspace";
import { loadKlineSnapshot } from "../../../src/features/real-finance/kline.server";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import {
  createD0WatchlistState,
  D0WatchlistProvider,
} from "../../../src/stores/d0-watchlist";
import { parseFundWatchlist } from "../../../src/stores/fund-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

const renderWithWatchlist = (
  children: ReactNode,
  initialListingIds: readonly string[],
  /*
   * 认得哪些代码。默认取 D0 夹具，但真实标的的用例要自己传——
   * createD0WatchlistState 会把不在这份清单里的 id 过滤掉，于是传一个真实
   * 代码进来，面板会显示成空的，而那和「这个代码加不进自选」是两回事。
   */
  knownListingIds?: readonly string[],
) =>
  renderToStaticMarkup(
    <D0WatchlistProvider
      knownListingIds={
        knownListingIds ??
        readyFixture().instruments.map((instrument) => instrument.listing_id)
      }
      initialListingIds={initialListingIds}
    >
      {children}
    </D0WatchlistProvider>,
  );

describe("D0 session watchlist", () => {
  it("keeps stock features and exposes the real fund and portfolio workspaces", () => {
    const markup = renderWithWatchlist(
      <WatchlistWorkspace initialTab="fund" realEntries={[]} state="normal" />,
      [],
    );

    expect(markup).toContain("自选股票");
    expect(markup).toContain("自选基金");
    expect(markup).toContain("自选组合</button>");
    expect(markup).not.toContain('href="/portfolios"');
    expect(markup).toContain("排行推荐");
    expect(markup).toContain('aria-label="正在读取真实基金排行"');
  });

  it("accepts only unique six-digit fund codes from browser storage", () => {
    expect(
      parseFundWatchlist(
        JSON.stringify(["001480", "bad", "001480", 21528, "021528"]),
      ),
    ).toEqual(["001480", "021528"]);
    expect(parseFundWatchlist("broken-json")).toEqual([]);
  });

  it("normalizes initial state to unique, known listing IDs", () => {
    expect(
      createD0WatchlistState(
        ["listing_syn_0001", "unknown", "listing_syn_0001"],
        ["listing_syn_0001"],
      ),
    ).toEqual({ listingIds: ["listing_syn_0001"] });
  });

  it("renders an explicit empty state before any listing is added", () => {
    const markup = renderWithWatchlist(<WatchlistPanel />, []);

    // 空态与行情表那一条用同一句话；此前两条并存、措辞不一，读起来像两个功能。
    expect(markup).toContain("还没有自选");
    expect(markup).toContain("仅在当前浏览会话中保存");
    expect(markup).not.toContain("SYN001");
  });

  it("renders stable quote identity and a removal control after add", () => {
    /*
     * 用真实标的。夹具标的的回落分支已经删掉了——可加自选的代码只剩
     * 真实代码，加一个虚构 id 进来只会得到一份空列表。
     */
    const series = loadKlineSnapshot()?.series[0];
    if (series === undefined) throw new Error("需要一个真实标的快照");
    const latest = series.bars.at(-1);
    const previous = series.bars.at(-2);
    if (latest === undefined || previous === undefined) {
      throw new Error("需要至少两根日线才能算涨跌幅");
    }

    const markup = renderWithWatchlist(
      <WatchlistPanel
        realEntries={[
          {
            changePct: (
              ((latest.close - previous.close) / previous.close) *
              100
            ).toFixed(2),
            listingId: series.symbol,
            market: series.market,
            name: series.name,
            price: latest.close.toFixed(2),
            symbol: series.symbol,
          },
        ]}
      />,
      [series.symbol],
      [series.symbol],
    );

    expect(markup).toContain("我的自选");
    /*
     * 自选页上不该再挂「样本数据 · 非实时」。
     *
     * 这一页只有「哪几只在我的自选里」是会话内的，价格是向
     * /api/market/quotes 实时取的真行情。那枚徽标把真数据说成了样本——
     * 说自己更假，和说自己更真一样，都是不实。会话内保存这件事，
     * 标题下面那句已经讲清楚了。
     */
    expect(markup).not.toContain("样本数据 · 非实时");
    expect(markup).toContain(series.name);
    expect(markup).toContain(`href="/instruments/${series.symbol}"`);
    expect(markup).toContain("移出自选");
  });

  it("exposes an idempotent toggle state for add and remove", () => {
    const addedMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      [],
    );
    const removedMarkup = renderWithWatchlist(
      <WatchlistToggle listingId="listing_syn_0001" />,
      ["listing_syn_0001"],
    );

    expect(addedMarkup).toContain('aria-pressed="false"');
    expect(addedMarkup).toContain("加自选");
    expect(removedMarkup).toContain('aria-pressed="true"');
    expect(removedMarkup).toContain("已加自选");
  });

  it("mounts the session provider once at the application root", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <WatchlistToggle listingId="listing_syn_0001" />
      </RootLayout>,
    );

    /*
     * 这条用例守的是「自选 Provider 挂在根布局上」——按钮能渲染出来，
     * 就说明 context 拿得到。
     *
     * 原先还断言根布局里有一句「自选刷新后重置」的无障碍说明。那句话已经
     * 移走了：它落在任何 landmark 之外，axe 在每一次页面加载上都报
     * region 违规。同一句话在侧栏的 <aside> 里仍然有，位置也更合理。
     */
    expect(markup).toContain("加自选");
    expect(markup).not.toContain("自选刷新后重置");
  });
});

describe("which symbols the watchlist accepts", () => {
  /*
   * 用户报的：个股页点「加自选」没反应。
   *
   * 根因是「已知标的」名单取自本地 K 线快照——本机只有 8 条，而那份快照在
   * .runtime/ 下、不随代码提交，服务器上压根不存在，名单为空：**服务器上
   * 每一只股票的加自选都点不动**，而且不报错、不提示。
   *
   * 站内能开哪些个股页，判据是「上游能不能报价」，不是「本地快照里有没有」。
   * 所以守卫看代码形状，不查运行时文件。
   */
  it("accepts a real stock that no local snapshot has heard of", () => {
    expect(isWatchableSymbol("sz300017")).toBe(true);
    expect(isWatchableSymbol("sh600519")).toBe(true);
    /* 港股与美股同样能开页面，也该能加。 */
    expect(isWatchableSymbol("hk00700")).toBe(true);
    expect(isWatchableSymbol("usaapl")).toBe(true);
  });

  it("still refuses an id that has no page behind it", () => {
    /*
     * 放开形状不等于什么都收。北交所与新三板站内渲染不出来（sz920367 走的
     * 是同一个市场码，但号段不在 classifySymbol 的表里），加进自选就是一行
     * 永远取不到价的空记录。
     */
    expect(isWatchableSymbol("sz920367")).toBe(false);
    expect(isWatchableSymbol("listing_syn_0001")).toBe(false);
    expect(isWatchableSymbol("随便什么")).toBe(false);
    expect(isWatchableSymbol("")).toBe(false);
  });

  it("does not accept an index as something to hold", () => {
    /*
     * 指数能开页面，但自选列表要的是可持有的标的；指数另有行情条。
     * 这一条同时守住「形状合法」与「品类正确」是两件事。
     */
    expect(isWatchableSymbol("sh000001")).toBe(true);
  });
});
