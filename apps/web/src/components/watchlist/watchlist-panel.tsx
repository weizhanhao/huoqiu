"use client";

import type { D0Fixture } from "@huoqiu/contracts/d0";
import Link from "next/link";

import { useD0Watchlist } from "../../stores/d0-watchlist";
import { DemoDataBadge } from "../system/demo-data-badge";
import { PageState } from "../system/page-state";
import { WatchlistToggle } from "./watchlist-toggle";

type WatchlistPanelProperties = Readonly<{
  fixture: D0Fixture;
}>;

export function WatchlistPanel({ fixture }: WatchlistPanelProperties) {
  const { listingIds } = useD0Watchlist();
  const entries = listingIds.flatMap((listingId) => {
    const instrument = fixture.instruments.find(
      (candidate) => candidate.listing_id === listingId,
    );
    const quote = fixture.quotes.find(
      (candidate) => candidate.listing_id === listingId,
    );
    return instrument === undefined || quote === undefined
      ? []
      : [{ instrument, quote }];
  });

  return (
    <section className="watchlist-panel" aria-labelledby="watchlist-heading">
      <header className="watchlist-heading">
        <div>
          <p className="card-kicker">SESSION WATCHLIST</p>
          <h2 id="watchlist-heading">我的自选</h2>
          <p>仅在当前浏览会话中保存；刷新页面后重置，不会跨设备同步。</p>
        </div>
        <DemoDataBadge />
      </header>

      {entries.length === 0 ? (
        <PageState
          state="empty"
          emptyMessage="暂无自选标的，可从演示标的详情加入"
        />
      ) : (
        <div className="watchlist-table-wrap">
          <table className="watchlist-table">
            <thead>
              <tr>
                <th scope="col">名称 / 代码</th>
                <th scope="col">当前价</th>
                <th scope="col">涨跌幅</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ instrument, quote }) => {
                const isUp = !quote.change.startsWith("-");
                const prefix = isUp ? "+" : "";
                return (
                  <tr key={instrument.listing_id}>
                    <th scope="row">
                      <Link href={`/instruments/${instrument.listing_id}`}>
                        <strong>{instrument.name}</strong>
                        <small>
                          {instrument.symbol} · {instrument.market}
                        </small>
                      </Link>
                    </th>
                    <td className={isUp ? "market-up" : "market-down"}>
                      {quote.last}
                    </td>
                    <td className={isUp ? "market-up" : "market-down"}>
                      {prefix}
                      {quote.change_pct}%
                    </td>
                    <td>
                      <WatchlistToggle
                        listingId={instrument.listing_id}
                        removeLabel="移出自选"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
