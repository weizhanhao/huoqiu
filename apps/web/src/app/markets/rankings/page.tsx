import type { Metadata } from "next";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { RealMarketRankings } from "../../../features/market-portfolio/real-market-rankings";

export const metadata: Metadata = {
  description: "沪深、港股与美股的实时涨跌榜",
  title: "榜单 · 火球",
};

type RankingsPageProperties = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/*
 * 可深链的市场与方向。
 *
 * 认不出来的取值回落到默认，而不是原样传下去——传下去接口会回 400，
 * 一个改错了地址栏的人会看到一片空白而不是一份榜单。
 */
const MARKETS = ["cn", "hk", "us"] as const;
const DIRECTIONS = ["gainers", "losers"] as const;

type MarketId = (typeof MARKETS)[number];
type DirectionId = (typeof DIRECTIONS)[number];

export default async function MarketRankingsPage({
  searchParams,
}: RankingsPageProperties) {
  const parameters = await searchParams;
  const market = firstValue(parameters.market);
  const direction = firstValue(parameters.direction);

  return (
    <DesktopShell activePrimary="markets">
      <RealMarketRankings
        initialDirection={
          DIRECTIONS.includes(direction as DirectionId)
            ? (direction as DirectionId)
            : "gainers"
        }
        initialMarket={
          MARKETS.includes(market as MarketId) ? (market as MarketId) : "cn"
        }
      />
    </DesktopShell>
  );
}
