import { cssVariables } from "@huoqiu/web-ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { syntheticListings } from "../features/market-portfolio/synthetic-data";
import { loadD0Fixture } from "../lib/d0-fixture";
import { D0WatchlistProvider } from "../stores/d0-watchlist";

import "./globals.css";

export const metadata: Metadata = {
  title: "火球",
  description: "公开市场信息的观察与整理",
};

type RootLayoutProperties = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProperties) {
  const fixtureResult = loadD0Fixture();
  const fixtureListingIds =
    fixtureResult.status === "ready"
      ? fixtureResult.data.instruments.map(
          (instrument) => instrument.listing_id,
        )
      : [];
  const knownListingIds = [
    ...new Set([
      ...fixtureListingIds,
      ...syntheticListings.map((listing) => listing.listingId),
    ]),
  ];

  return (
    <html lang="zh-CN">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      </head>
      <body>
        <D0WatchlistProvider knownListingIds={knownListingIds}>
          <span className="visually-hidden">
            自选数据仅当前会话保存，刷新后重置
          </span>
          {children}
        </D0WatchlistProvider>
      </body>
    </html>
  );
}
