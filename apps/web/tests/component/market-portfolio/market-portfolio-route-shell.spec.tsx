import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstrumentLayout from "../../../src/app/instruments/[listingId]/layout";
import InstrumentPage from "../../../src/app/instruments/[listingId]/page";
import MarketRankingsPage from "../../../src/app/markets/rankings/page";
import MarketsPage from "../../../src/app/markets/page";
import PortfolioPage from "../../../src/app/portfolios/[portfolioId]/page";
import PortfoliosPage from "../../../src/app/portfolios/page";
import { syntheticListings } from "../../../src/features/market-portfolio/synthetic-data";
import { loadKlineSnapshot } from "../../../src/features/real-finance/kline.server";
import { createPortfolio } from "../../../src/server/portfolio-store";
import { registerAccount } from "../../../src/server/social-store";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const renderRoute = (children: ReactNode): string =>
  renderToStaticMarkup(
    <D0WatchlistProvider
      knownListingIds={syntheticListings.map((listing) => listing.listingId)}
    >
      {children}
    </D0WatchlistProvider>,
  );

const extractNavigation = (markup: string, pattern: RegExp): string =>
  pattern.exec(markup)?.[1] ?? "";

const expectPrimaryDestination = (markup: string, href: string): void => {
  const desktopNavigation = extractNavigation(
    markup,
    /<nav aria-label="主导航">([\s\S]*?)<\/nav>/u,
  );
  const mobileNavigation = extractNavigation(
    markup,
    /<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/u,
  );
  const escapedHref = href.replaceAll("/", "\\/");
  const currentDestination = new RegExp(
    `<a[^>]*(?:aria-current="page"[^>]*href="${escapedHref}"|href="${escapedHref}"[^>]*aria-current="page")`,
    "u",
  );

  expect(desktopNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
  expect(desktopNavigation).toMatch(currentDestination);
  expect(mobileNavigation.match(/aria-current="page"/gu)).toHaveLength(1);
  expect(mobileNavigation).toMatch(currentDestination);
};

/*
 * 组合详情要一个真实存在的组合。
 *
 * 这条用例过去传的是 portfolio_syn_0001——一条写死的样本组合。样本组合已经
 * 全部删掉了：榜单和详情页现在只认账号真实建过的组合，不存在的 id 就是 404。
 * 所以这里先真建一个。
 */
let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-route-shell-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const makeRealPortfolio = (): string => {
  const account = registerAccount({
    displayName: "张远",
    email: "route-shell@example.com",
    now: "2026-08-13T00:00:00.000Z",
    password: "Correct-Horse-9",
  });
  if ("error" in account) throw new Error(account.error);

  const created = createPortfolio({
    holdings: [
      { symbol: "sh600519", weight: 60 },
      { symbol: "sz300862", weight: 40 },
    ],
    name: "路由外壳",
    now: "2026-08-13T01:00:00.000Z",
    ownerId: account.account.id,
    summary: "",
  });
  if ("error" in created) throw new Error(created.error);
  return created.portfolio.id;
};

describe("market and portfolio route shell truth", () => {
  it("keeps market dashboards and rankings current in both navigation layers", async () => {
    expectPrimaryDestination(renderRoute(<MarketsPage />), "/markets");
    /*
     * 榜单页现在读 ?market= / ?direction= 做深链，所以是 async 且要
     * searchParams——不给的话它在解构那一步就抛了。
     */
    const rankings = await MarketRankingsPage({
      searchParams: Promise.resolve({}),
    });
    expectPrimaryDestination(renderRoute(rankings), "/markets");
  });

  it("gives instrument detail its own page instead of a community surface", async () => {
    /*
     * 这条用例原先断言个股页在社区主导航里把「行情」标成当前项——因为它
     * 那时套的就是社区壳：外面裹着用户卡片、指数条、「首页/关注/热门/7x24」
     * 那排页签和右栏热股榜，中间才是这只股票。那不是「一只股票的页面」，
     * 是「社区页里塞了一只股票」。
     *
     * 现在个股是独立版面，压根没有那套主导航，「哪一项是当前项」这个问题
     * 也就不再成立。改成验它真的独立了：社区那些东西一个都不许出现，
     * 但得留一条回得去的路——否则这一页就是死胡同。
     */
    const symbol = loadKlineSnapshot()?.series[0]?.symbol;
    if (symbol === undefined) throw new Error("需要一个真实标的快照");
    /* 外壳在 layout 里，社区那套壳在不在要连着 layout 一起看。 */
    const params = Promise.resolve({ listingId: symbol });
    const markup = renderRoute(
      await InstrumentLayout({
        children: await InstrumentPage({ params }),
        params,
      }),
    );

    expect(markup).not.toMatch(/<nav aria-label="主导航">/u);
    for (const chrome of ["热股榜", "7x24", "涨跌榜", "写帖子"]) {
      expect(markup, chrome).not.toContain(chrome);
    }
    expect(markup).toContain('href="/"');
  });

  it("keeps portfolio dashboard and detail current in both navigation layers", async () => {
    const portfolioDetail = await PortfolioPage({
      params: Promise.resolve({ portfolioId: makeRealPortfolio() }),
    });

    expectPrimaryDestination(renderRoute(<PortfoliosPage />), "/portfolios");
    expectPrimaryDestination(renderRoute(portfolioDetail), "/portfolios");
  });
});
