import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import {
  WatchlistPanel,
  type WatchlistEntry,
} from "../../components/watchlist/watchlist-panel";
import { loadKlineSnapshot } from "../../features/real-finance/kline.server";
import { loadD0Fixture } from "../../lib/d0-fixture";
import { normalizeD0FixtureState } from "../../lib/d0-page-state";

/*
 * 真实标的的自选行。
 *
 * 最新价取最后一根日线的收盘价，涨跌幅按最后两根收盘价算——两个数都直接
 * 来自真实日线，不做任何估计。不足两根就整条不显示，而不是补一个 0.00
 * 假装当天没涨没跌。
 */
const realWatchlistEntries = (): readonly WatchlistEntry[] =>
  (loadKlineSnapshot()?.series ?? []).flatMap<WatchlistEntry>((series) => {
    const latest = series.bars.at(-1);
    const previous = series.bars.at(-2);
    if (latest === undefined || previous === undefined) {
      return [];
    }
    return [
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
    ];
  });

export const metadata: Metadata = {
  description: "自选分组、排序与批量管理",
  title: "自选 · 火球",
};

type WatchlistPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export default async function WatchlistPage({
  searchParams,
}: WatchlistPageProperties) {
  const fixtureResult = loadD0Fixture();
  const state = normalizeD0FixtureState((await searchParams).fixture_state);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {/*
        面板不再吃 D0 夹具：可加自选的代码只剩真实代码，那份夹具在这里
        一次也不会被查到，却会整份塞进这一页的载荷。
      */}
      {fixtureResult.status === "ready" ? (
        <WatchlistPanel realEntries={realWatchlistEntries()} state={state} />
      ) : null}
    </DesktopShell>
  );
}
