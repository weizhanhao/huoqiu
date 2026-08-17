import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MarketOverview, Quote } from "../../../src/api/market-api";
import { MarketScreen } from "../../../src/components/markets/market-screen";
import { PortfolioScreen } from "../../../src/components/markets/portfolio-screen";
import { WatchlistScreen } from "../../../src/components/markets/watchlist-screen";

/*
 * 行情、自选、组合三屏。
 *
 * 三页此前读的都是写死的合成夹具。这些用例守的是接上真实接口之后的行为，
 * 其中最要紧的一条：取不到数据时说清是取不到，而不是说成「没有数据」。
 */

const overview: MarketOverview = {
  breadth: { advancing: 3869, declining: 1242, unchanged: 170 },
  concepts: [
    {
      advancing: 27,
      changePercent: 5.01,
      code: "BK1152",
      declining: 1,
      leaderName: "兴森科技",
      name: "先进封装",
    },
  ],
  delayed: true,
  indexes: [
    {
      changePercent: 1.43,
      last: 3983.29,
      name: "上证指数",
      symbol: "sh000001",
    },
    {
      changePercent: -0.52,
      last: 14_658.17,
      name: "深证成指",
      symbol: "sz399001",
    },
  ],
  industries: [
    {
      advancing: 3,
      changePercent: 10.69,
      code: "BK1510",
      declining: 0,
      leaderName: "天山生物",
      name: "其他养殖",
    },
  ],
};

const quote = (symbol: string, name: string, changePercent: number): Quote => ({
  changeAmount: changePercent,
  changePercent,
  last: 100,
  name,
  symbol,
  tradedAtSeconds: 1_786_949_941,
});

describe("market screen", () => {
  it("shows real indexes, breadth and the delayed badge", () => {
    const markup = renderToStaticMarkup(
      <MarketScreen
        failure={null}
        loading={false}
        onRefresh={vi.fn()}
        overview={overview}
      />,
    );

    expect(markup).toContain("上证指数");
    expect(markup).toContain("3983.29");
    expect(markup).toContain("3869 涨");
    /* 延时必须标出来，否则会被当成逐笔实时去用。 */
    expect(markup).toContain("延时行情");
    expect(markup).toContain("先进封装");
    expect(markup).toContain("天山生物");
  });

  it("marks a rise with a plus sign, not colour alone", () => {
    /*
     * 只靠红绿区分方向，色觉障碍的人看到的是两个一样的数字，截图转灰度后
     * 谁也分不出来。
     */
    const markup = renderToStaticMarkup(
      <MarketScreen
        failure={null}
        loading={false}
        onRefresh={vi.fn()}
        overview={overview}
      />,
    );

    expect(markup).toContain("+1.43%");
    expect(markup).toContain("-0.52%");
  });

  it("says it could not fetch instead of showing an empty market", () => {
    const markup = renderToStaticMarkup(
      <MarketScreen
        failure="连不上服务器。确认手机和服务在同一个网络里。"
        loading={false}
        onRefresh={vi.fn()}
        overview={null}
      />,
    );

    expect(markup).toContain("连不上服务器");
    expect(markup).not.toContain("延时行情");
  });
});

describe("watchlist screen", () => {
  it("lists the account's symbols with live quotes", () => {
    const markup = renderToStaticMarkup(
      <WatchlistScreen
        failure={null}
        loading={false}
        onRefresh={vi.fn()}
        quotes={[quote("sh600519", "贵州茅台", -3.64)]}
        signedIn
        symbols={["sh600519"]}
      />,
    );

    expect(markup).toContain("贵州茅台");
    expect(markup).toContain("sh600519");
    expect(markup).toContain("-3.64%");
  });

  it("keeps a row visible when its quote is missing", () => {
    /*
     * 报不出价的那一行要留着并说明白。整行消失的话，用户会以为自选被删了。
     */
    const markup = renderToStaticMarkup(
      <WatchlistScreen
        failure={null}
        loading={false}
        onRefresh={vi.fn()}
        quotes={[]}
        signedIn
        symbols={["sh600519"]}
      />,
    );

    expect(markup).toContain("sh600519");
    expect(markup).toContain("取不到价");
  });

  it("tells a signed-out visitor the list lives on the account", () => {
    const markup = renderToStaticMarkup(
      <WatchlistScreen
        failure={null}
        loading={false}
        onRefresh={vi.fn()}
        quotes={[]}
        signedIn={false}
        symbols={[]}
      />,
    );

    expect(markup).toContain("登录后这里会显示你的自选");
    expect(markup).toContain("和网页版是同一份");
  });

  it("does not claim the list is empty when the fetch failed", () => {
    const markup = renderToStaticMarkup(
      <WatchlistScreen
        failure="连不上服务器。确认手机和服务在同一个网络里。"
        loading={false}
        onRefresh={vi.fn()}
        quotes={[]}
        signedIn
        symbols={[]}
      />,
    );

    expect(markup).toContain("连不上服务器");
    expect(markup).not.toContain("还没有自选");
  });
});

describe("portfolio screen", () => {
  it("separates portfolios I created from ones I follow", () => {
    const markup = renderToStaticMarkup(
      <PortfolioScreen
        board={[]}
        boardFailure={null}
        failure={null}
        loading={false}
        onOpenPortfolio={vi.fn()}
        onRefresh={vi.fn()}
        sets={{
          created: [
            {
              holdings: [{ symbol: "sh600519", weight: 12.5 }],
              id: "pf_1",
              name: "我的第一个组合",
            },
          ],
          followed: [],
        }}
        signedIn
      />,
    );

    expect(markup).toContain("我建的");
    expect(markup).toContain("我的第一个组合");
    expect(markup).toContain("1 只持仓");
    expect(markup).toContain("我关注的");
    expect(markup).toContain("还没有关注任何组合");
  });

  it("tells a signed-out visitor to log in", () => {
    const markup = renderToStaticMarkup(
      <PortfolioScreen
        board={[]}
        boardFailure={null}
        failure={null}
        loading={false}
        onOpenPortfolio={vi.fn()}
        onRefresh={vi.fn()}
        sets={null}
        signedIn={false}
      />,
    );

    expect(markup).toContain("登录后这里会显示你建的和关注的组合");
    expect(markup).not.toContain("我建的");
  });
  it("ranks the board and says so when a return cannot be computed", () => {
    /*
     * 算不出收益的那条要写「—」，不能写成 0.00%：0 的意思是「今天没动」，
     * 而事实是有一只持仓没取到行情——两者会被排进同一个名次区间。
     */
    const markup = renderToStaticMarkup(
      <PortfolioScreen
        board={[
          {
            dayReturn: 2.5,
            portfolio: {
              followerCount: 3,
              holdings: [{ symbol: "sh600519", weight: 100 }],
              id: "pf_1",
              name: "稳一点",
              ownerName: "林岸",
            },
          },
          {
            dayReturn: null,
            portfolio: {
              followerCount: 0,
              holdings: [{ symbol: "sz000001", weight: 100 }],
              id: "pf_2",
              name: "停牌那只",
              ownerName: "周野",
            },
          },
        ]}
        boardFailure={null}
        failure={null}
        loading={false}
        onOpenPortfolio={vi.fn()}
        onRefresh={vi.fn()}
        sets={null}
        signedIn={false}
      />,
    );

    expect(markup).toContain("火球组合擂台榜");
    expect(markup).toContain("+2.50%");
    expect(markup).toContain("林岸 主理");
    expect(markup).toContain("3 人关注");
    expect(markup).toContain("—");
    expect(markup).not.toContain("0.00%");
  });

  it("does not call an unfetched board empty", () => {
    /*
     * 「还没取到」和「一个组合都没有」是两回事。混成一句，网慢时这一页会说
     * 站内没人建过组合——而那是假的。
     */
    const loading = renderToStaticMarkup(
      <PortfolioScreen
        board={null}
        boardFailure={null}
        failure={null}
        loading={false}
        onOpenPortfolio={vi.fn()}
        onRefresh={vi.fn()}
        sets={null}
        signedIn={false}
      />,
    );

    expect(loading).toContain("正在读取榜单");
    expect(loading).not.toContain("还没有人建过组合");
  });

  it("names this product on the board, not the one it was modelled on", () => {
    const markup = renderToStaticMarkup(
      <PortfolioScreen
        board={[]}
        boardFailure={null}
        failure={null}
        loading={false}
        onOpenPortfolio={vi.fn()}
        onRefresh={vi.fn()}
        sets={null}
        signedIn={false}
      />,
    );

    expect(markup).toContain("火球组合擂台榜");
    expect(markup).not.toContain("雪球");
  });
});
