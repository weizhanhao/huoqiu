import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import CommunityPage from "../../src/app/community/page";
import CreatorsPage from "../../src/app/creators/page";
import HomePage from "../../src/app/page";
import MarketRankingsPage from "../../src/app/markets/rankings/page";
import MarketsPage from "../../src/app/markets/page";
import NotificationsPage from "../../src/app/notifications/page";
import PortfoliosPage from "../../src/app/portfolios/page";
import PrivateFundsPage from "../../src/app/private-funds/page";
import PublishPage from "../../src/app/publish/page";
import SearchPage from "../../src/app/search/page";
import VideosPage from "../../src/app/videos/page";
import WatchlistPage from "../../src/app/watchlist/page";
import { NotificationSessionProvider } from "../../src/features/notifications/notification-state";
import { syntheticListings } from "../../src/features/market-portfolio/synthetic-data";
import { D0WatchlistProvider } from "../../src/stores/d0-watchlist";

/*
 * 每一页要有自己的标题。
 *
 * 站名此前是 <h1>，于是全站二十多条路由的唯一 h1 都是「火球」——靠标题
 * 导航的人在这些页面之间来回跳，听到的永远是同一个词，完全不知道自己
 * 在哪一页；而八个设置子页更是连自己的标题都没有，页面上第一个标题是
 * 右栏的「热股榜」。
 *
 * 这一份把两件事钉住：每一页恰好一个 h1；那个 h1 不是站名。
 * 少一个 h1 不会有任何报错，页面看起来也完全正常——只有读屏的人会发现。
 */

/*
 * 根布局提供的 Provider 在这里照搬一遍。
 * 少一个，用到它的那一页会直接抛错，而那是环境缺失，不是标题的问题。
 */
const renderRoute = (children: ReactNode): string =>
  renderToStaticMarkup(
    <NotificationSessionProvider>
      <D0WatchlistProvider
        knownListingIds={syntheticListings.map((listing) => listing.listingId)}
      >
        {children}
      </D0WatchlistProvider>
    </NotificationSessionProvider>,
  );

const headingsOf = (markup: string): readonly string[] =>
  [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gu)].map((match) =>
    (match[1] ?? "").replaceAll(/<[^>]*>/gu, "").trim(),
  );

const ROUTES: readonly (readonly [string, () => Promise<ReactNode>])[] = [
  ["/", async () => HomePage()],
  ["/community", async () => CommunityPage()],
  ["/creators", async () => CreatorsPage()],
  ["/markets", async () => MarketsPage()],
  [
    "/markets/rankings",
    async () => MarketRankingsPage({ searchParams: Promise.resolve({}) }),
  ],
  [
    "/notifications",
    async () => NotificationsPage({ searchParams: Promise.resolve({}) }),
  ],
  ["/portfolios", async () => PortfoliosPage()],
  ["/private-funds", async () => PrivateFundsPage()],
  ["/publish", async () => PublishPage()],
  ["/search", async () => SearchPage({ searchParams: Promise.resolve({}) })],
  ["/videos", async () => VideosPage()],
  [
    "/watchlist",
    async () => WatchlistPage({ searchParams: Promise.resolve({}) }),
  ],
];

describe("every page says which page it is", () => {
  it.each(ROUTES)(
    "gives %s exactly one heading of its own",
    async (route, render) => {
      const headings = headingsOf(renderRoute(await render()));

      expect(headings, route).toHaveLength(1);
      // 站名不是页面标题。它仍然在顶栏上，只是不再是 h1。
      expect(headings[0], route).not.toBe("火球");
      expect(headings[0]?.length ?? 0, route).toBeGreaterThan(0);
    },
  );
});
