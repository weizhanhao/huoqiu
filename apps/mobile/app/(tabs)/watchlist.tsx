import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import {
  fetchMarketOverview,
  fetchPortfolios,
  fetchQuotes,
  fetchWatchlist,
  type Quote,
} from "../../src/api/market-api";
import type { ApiResult } from "../../src/api/request";
import { MarketScreen } from "../../src/components/markets/market-screen";
import { PortfolioScreen } from "../../src/components/markets/portfolio-screen";
import { WatchlistScreen as WatchlistView } from "../../src/components/markets/watchlist-screen";
import { SegmentHeader } from "../../src/components/shell/segment-header";
import { useComingSoon } from "../../src/components/system/coming-soon";
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

type WatchlistData = Readonly<{
  quotes: readonly Quote[];
  /* 名单拿到了、行情没拿到时不能把整页判为失败——那样用户会以为自选丢了。 */
  quoteFailure: string | null;
  symbols: readonly string[];
}>;

export default function WatchlistScreen() {
  const router = useRouter();
  const { account, callAs } = useAccountSession();
  const { show } = useComingSoon();
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

  const watchlist = useRemote(loadWatchlist);
  const overview = useRemote(fetchMarketOverview);
  const loadPortfolios = useCallback(
    () => callAs(fetchPortfolios),
    [callAs],
  );
  const portfolios = useRemote(loadPortfolios);

  return (
    <View style={{ backgroundColor: tokens.surface.canvas, flex: 1 }}>
      <SegmentHeader
        actions={
          segment === "portfolio"
            ? [
                {
                  glyph: "⊕",
                  label: "新建组合",
                  onPress: () => {
                    show(
                      "新建组合",
                      "在这里建一个自己的模拟组合、记录调仓。这一块还没做。",
                    );
                  },
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
          onRefresh={overview.refresh}
          overview={overview.value}
        />
      ) : null}

      {segment === "portfolio" ? (
        <PortfolioScreen
          failure={portfolios.failure}
          loading={portfolios.loading}
          onRefresh={portfolios.refresh}
          sets={portfolios.value}
          signedIn={account !== null}
        />
      ) : null}
    </View>
  );
}
