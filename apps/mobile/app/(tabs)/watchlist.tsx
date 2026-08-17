import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { dayReturn } from "@huoqiu/domain/market/portfolio-return";

import {
  fetchMarketOverview,
  fetchPortfolios,
  fetchPublicPortfolios,
  fetchQuotes,
  fetchWatchlist,
  type PublicPortfolio,
  type Quote,
} from "../../src/api/market-api";
import type { ApiResult } from "../../src/api/request";
import { MarketScreen } from "../../src/components/markets/market-screen";
import {
  PortfolioScreen,
  type BoardRow,
} from "../../src/components/markets/portfolio-screen";
import { WatchlistScreen as WatchlistView } from "../../src/components/markets/watchlist-screen";
import { SegmentHeader } from "../../src/components/shell/segment-header";
import { useRemote } from "../../src/hooks/use-remote";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 自选页签。
 *
 * 参考图里「自选 / 行情 / 组合」是这一个页签内部的三个分段，不是三个底部页签。
 * 三段共用顶部那一行大字标题和右侧的搜索入口。
 */

type Segment = "markets" | "portfolio" | "watchlist";

const segments = [
  { id: "watchlist", label: "自选" },
  { id: "markets", label: "行情" },
  { id: "portfolio", label: "组合" },
] as const satisfies readonly Readonly<{ id: Segment; label: string }>[];

/*
 * 榜单一次取齐。
 *
 * 组合列表和它们持仓的行情要一起到位才算数——分两次取的话，先到的组合会先
 * 渲染出一片「—」，几百毫秒后再跳成真数字，看起来像刚刚才算错过一次。
 */
type BoardData = Readonly<{ rows: readonly BoardRow[] }>;

const loadBoard = async (): Promise<ApiResult<BoardData>> => {
  const listed = await fetchPublicPortfolios();
  if (listed.kind !== "ok") return listed;

  const symbols = [
    ...new Set(
      listed.value.flatMap((portfolio) =>
        (portfolio.holdings ?? []).map((holding) => holding.symbol),
      ),
    ),
  ];
  const priced = await fetchQuotes(symbols);
  const changes = new Map<string, number | null>(
    priced.kind === "ok"
      ? priced.value.map((quote) => [quote.symbol, quote.changePercent])
      : [],
  );

  const rows = listed.value
    .map((portfolio: PublicPortfolio) => ({
      dayReturn: dayReturn(portfolio.holdings ?? [], changes),
      portfolio,
    }))
    /*
     * 算不出收益的排在最后，而不是当 0 混在中间。它们不是「今天没动」，
     * 是不知道——混在中间会把一堆未知排到真涨的组合前面。
     */
    .sort((left, right) => {
      if (left.dayReturn === null) return right.dayReturn === null ? 0 : 1;
      if (right.dayReturn === null) return -1;
      return right.dayReturn - left.dayReturn;
    });

  return { kind: "ok", value: { rows } };
};

type WatchlistData = Readonly<{
  quotes: readonly Quote[];
  /* 名单拿到了、行情没拿到时不能把整页判为失败——那样用户会以为自选丢了。 */
  quoteFailure: string | null;
  symbols: readonly string[];
}>;

export default function WatchlistScreen() {
  const router = useRouter();
  const { account, callAs } = useAccountSession();
  const [segment, setSegment] = useState<Segment>("watchlist");

  const loadWatchlist = useCallback(async (): Promise<
    ApiResult<WatchlistData>
  > => {
    const list = await callAs(fetchWatchlist);
    if (list.kind !== "ok") return list;
    const priced = await fetchQuotes(list.value);
    return {
      kind: "ok",
      value: {
        quoteFailure: priced.kind === "ok" ? null : priced.message,
        quotes: priced.kind === "ok" ? priced.value : [],
        symbols: list.value,
      },
    };
  }, [callAs]);

  /* 在个股页加了自选、在新建页建了组合，回到这一页要看得到。 */
  const watchlist = useRemote(loadWatchlist, { refreshOnFocus: true });
  const overview = useRemote(fetchMarketOverview);
  const loadPortfolios = useCallback(
    () => callAs(fetchPortfolios),
    [callAs],
  );
  const portfolios = useRemote(loadPortfolios, { refreshOnFocus: true });
  const board = useRemote(loadBoard, { refreshOnFocus: true });

  return (
    <View style={{ backgroundColor: tokens.surface.canvas, flex: 1 }}>
      <SegmentHeader
        actions={
          segment === "portfolio"
            ? [
                {
                  glyph: "⊕",
                  label: "新建组合",
                  onPress: () => router.push("/portfolio/new"),
                },
                {
                  glyph: "⌕",
                  label: "搜索",
                  onPress: () => router.push("/search"),
                },
              ]
            : [
                {
                  glyph: "⌕",
                  label: "搜索",
                  onPress: () => router.push("/search"),
                },
              ]
        }
        active={segment}
        onSelect={setSegment}
        segments={segments}
      />

      {segment === "watchlist" ? (
        <WatchlistView
          failure={watchlist.failure ?? watchlist.value?.quoteFailure ?? null}
          loading={watchlist.loading}
          onOpenInstrument={(symbol) => {
            router.push({
              params: { listingId: symbol },
              pathname: "/instrument/[listingId]",
            });
          }}
          onRefresh={watchlist.refresh}
          quotes={watchlist.value?.quotes ?? []}
          signedIn={account !== null}
          symbols={watchlist.value?.symbols ?? []}
        />
      ) : null}

      {segment === "markets" ? (
        <MarketScreen
          failure={overview.failure}
          loading={overview.loading}
          onOpenInstrument={(href) => {
            /* 服务端给的是站内地址 /instruments/<code>，取末段做参数。 */
            const listingId = href.split("/").pop() ?? href;
            if (listingId.length === 0) return;
            router.push({
              params: { listingId },
              pathname: "/instrument/[listingId]",
            });
          }}
          onRefresh={overview.refresh}
          overview={overview.value}
        />
      ) : null}

      {segment === "portfolio" ? (
        <PortfolioScreen
          board={board.value?.rows ?? null}
          boardFailure={board.failure}
          failure={portfolios.failure}
          onOpenPortfolio={(portfolioId) => {
            router.push({
              params: { portfolioId },
              pathname: "/portfolio/[portfolioId]",
            });
          }}
          loading={portfolios.loading}
          onRefresh={portfolios.refresh}
          sets={portfolios.value}
          signedIn={account !== null}
        />
      ) : null}
    </View>
  );
}
