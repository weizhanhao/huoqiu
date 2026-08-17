import { useCallback } from "react";

import type { ApiResult } from "../../src/api/request";
import {
  fetchQuotes,
  fetchWatchlist,
  type Quote,
} from "../../src/api/market-api";
import { WatchlistScreen as WatchlistView } from "../../src/components/markets/watchlist-screen";
import { useRemote } from "../../src/hooks/use-remote";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 自选。
 *
 * 名单来自账号（/api/social/watchlist），不是设备本地——手机上加的自选，
 * 电脑上打开就在。行情按名单现取。
 */

type WatchlistData = Readonly<{
  quotes: readonly Quote[];
  /*
   * 行情单独的失败原因。
   *
   * 名单拿到了、行情没拿到时，整页不能判为失败——那样用户会以为自选丢了。
   * 名单照常列出，每一行自己显示「取不到价」，失败原因单独带出来。
   */
  quoteFailure: string | null;
  symbols: readonly string[];
}>;

export default function WatchlistScreen() {
  const { account, callAs } = useAccountSession();

  const load = useCallback(async (): Promise<ApiResult<WatchlistData>> => {
    const list = await callAs(fetchWatchlist);
    /* 名单取不到就别去取行情——拿旧名单取来的价对不上现在的自选。 */
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

  const { failure, loading, refresh, value } = useRemote(load);

  return (
    <WatchlistView
      failure={failure ?? value?.quoteFailure ?? null}
      loading={loading}
      onRefresh={refresh}
      quotes={value?.quotes ?? []}
      signedIn={account !== null}
      symbols={value?.symbols ?? []}
    />
  );
}
