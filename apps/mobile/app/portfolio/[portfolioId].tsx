import { dayReturn } from "@huoqiu/domain/market/portfolio-return";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import {
  fetchPortfolios,
  fetchPublicPortfolios,
  fetchQuotes,
  setPortfolioFollowed,
  type PublicPortfolio,
  type Quote,
} from "../../src/api/market-api";
import type { ApiResult } from "../../src/api/request";
import { PortfolioDetailScreen } from "../../src/components/markets/portfolio-detail-screen";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 组合详情。
 *
 * 此前读的是合成夹具——组合榜上那些真组合点进来，得到的是「未找到该合成组合」。
 *
 * 组合本身从公开榜里按 id 挑：服务端没有单条组合的接口，而那份列表组合页已经
 * 在取。行情另取，它才是这一页会变的部分。
 */

type DetailData = Readonly<{
  portfolio: PublicPortfolio | null;
  quotes: ReadonlyMap<string, Quote>;
}>;

const NO_QUOTES: ReadonlyMap<string, Quote> = new Map();

export default function PortfolioDetailRoute() {
  const router = useRouter();
  const { fail } = useComingSoon();
  const { account, callAs } = useAccountSession();
  const parameters = useLocalSearchParams<{
    portfolioId?: string | string[];
  }>();

  const raw = Array.isArray(parameters.portfolioId)
    ? parameters.portfolioId[0]
    : parameters.portfolioId;
  const portfolioId = raw ?? "";

  const load = useCallback(async (): Promise<ApiResult<DetailData>> => {
    const listed = await fetchPublicPortfolios();
    if (listed.kind !== "ok") return listed;

    const portfolio =
      listed.value.find((entry) => entry.id === portfolioId) ?? null;
    const priced = await fetchQuotes(
      (portfolio?.holdings ?? []).map((holding) => holding.symbol),
    );

    return {
      kind: "ok",
      value: {
        portfolio,
        quotes: new Map(
          priced.kind === "ok"
            ? priced.value.map((quote) => [quote.symbol, quote])
            : [],
        ),
      },
    };
  }, [portfolioId]);

  const detail = useRemote(load);
  const mine = useRemote(useCallback(() => callAs(fetchPortfolios), [callAs]));

  const portfolio = detail.value?.portfolio ?? null;
  const quotes = detail.value?.quotes ?? NO_QUOTES;
  const isMine = (mine.value?.created ?? []).some(
    (entry) => entry.id === portfolioId,
  );
  const followed = (mine.value?.followed ?? []).some(
    (entry) => entry.id === portfolioId,
  );

  const changes = new Map<string, number | null>(
    [...quotes].map(([symbol, quote]) => [symbol, quote.changePercent]),
  );

  return (
    <PortfolioDetailScreen
      dayReturn={
        portfolio === null ? null : dayReturn(portfolio.holdings ?? [], changes)
      }
      failure={detail.failure}
      /* 自己建的组合不给关注按钮：关注自己没有意义，服务端也不会记。 */
      following={account === null || isMine ? null : followed}
      loaded={detail.value !== null}
      onBack={createD0BackHandler(router, "/watchlist")}
      onOpenInstrument={(symbol) => {
        router.push({
          params: { listingId: symbol },
          pathname: "/instrument/[listingId]",
        });
      }}
      onToggleFollow={() => {
        void (async () => {
          const result = await callAs((token) =>
            setPortfolioFollowed(token, portfolioId, !followed),
          );
          if (result.kind === "ok") {
            /* 关注数印在这一页上，所以两份都要重取。 */
            mine.refresh();
            detail.refresh();
            return;
          }
          fail(followed ? "取关没成功" : "关注没成功", result.message);
        })();
      }}
      portfolio={portfolio}
      quotes={quotes}
    />
  );
}
