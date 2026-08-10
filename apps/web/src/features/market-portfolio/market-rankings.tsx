"use client";

import Link from "next/link";
import { useReducer } from "react";

import { WatchlistToggle } from "../../components/watchlist/watchlist-toggle";

import styles from "./market-portfolio.module.css";
import {
  rankingMarketTabs,
  syntheticListings,
  type RankingDirection,
  type RankingMarket,
} from "./synthetic-data";

export type MarketRankingsState = Readonly<{
  market: RankingMarket;
  ranking: RankingDirection;
}>;

export type MarketRankingsAction =
  | Readonly<{ type: "select-market"; market: RankingMarket }>
  | Readonly<{ type: "select-ranking"; ranking: RankingDirection }>;

export const marketRankingsInitialState: MarketRankingsState = {
  market: "ALL",
  ranking: "gainers",
};

export const marketRankingsReducer = (
  state: MarketRankingsState,
  action: MarketRankingsAction,
): MarketRankingsState => {
  switch (action.type) {
    case "select-market":
      return { ...state, market: action.market };
    case "select-ranking":
      return { ...state, ranking: action.ranking };
  }
};

type MarketRankingsProperties = Readonly<{
  initialState?: MarketRankingsState;
}>;

export function MarketRankings({
  initialState = marketRankingsInitialState,
}: MarketRankingsProperties) {
  const [state, dispatch] = useReducer(marketRankingsReducer, initialState);
  const marketLabel =
    rankingMarketTabs.find((tab) => tab.id === state.market)?.label ??
    "全部市场";
  const listings = syntheticListings
    .filter(
      (listing) => state.market === "ALL" || listing.market === state.market,
    )
    .toSorted((left, right) =>
      state.ranking === "gainers"
        ? right.changePct - left.changePct
        : left.changePct - right.changePct,
    );

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          <Link className={styles.backLink} href="/markets">
            ← 行情中心
          </Link>
          <p className={styles.kicker}>FULL SYNTHETIC RANKING</p>
          <h2>完整榜单</h2>
          <p>所有价格和涨跌均为固定合成数据，不代表真实市场。</p>
        </div>
        <div className={styles.disclosures}>
          <strong>演示数据 / 合成数据</strong>
          <span>不构成投资建议</span>
        </div>
      </header>

      <section className={styles.filterPanel} aria-label="榜单筛选">
        <div>
          <span className={styles.filterLabel}>市场</span>
          <div className={styles.segmented}>
            {rankingMarketTabs.map((tab) => (
              <button
                aria-pressed={state.market === tab.id}
                key={tab.id}
                onClick={() =>
                  dispatch({ type: "select-market", market: tab.id })
                }
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={styles.filterLabel}>方向</span>
          <div className={styles.segmented}>
            <button
              aria-pressed={state.ranking === "gainers"}
              onClick={() =>
                dispatch({ type: "select-ranking", ranking: "gainers" })
              }
              type="button"
            >
              涨幅榜
            </button>
            <button
              aria-pressed={state.ranking === "losers"}
              onClick={() =>
                dispatch({ type: "select-ranking", ranking: "losers" })
              }
              type="button"
            >
              跌幅榜
            </button>
          </div>
        </div>
      </section>
      <p aria-live="polite" className="visually-hidden">
        当前显示{marketLabel}
        {state.ranking === "gainers" ? "涨幅榜" : "跌幅榜"}，共
        {listings.length}项
      </p>

      <section className={styles.panel} aria-labelledby="full-ranking-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>固定快照 · 共 {listings.length} 项</p>
            <h3 id="full-ranking-heading">
              {marketLabel}
              {state.ranking === "gainers" ? "涨幅榜" : "跌幅榜"}
            </h3>
          </div>
          <span>红涨绿跌</span>
        </div>
        <div className={styles.tableScroller}>
          <table aria-label="合成标的完整榜单" className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">排名</th>
                <th scope="col">标的</th>
                <th scope="col">市场</th>
                <th scope="col">现价</th>
                <th scope="col">涨跌幅</th>
                <th scope="col">自选</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing, index) => (
                <tr key={listing.listingId}>
                  <td>{String(index + 1).padStart(2, "0")}</td>
                  <th scope="row">
                    <Link href={`/instruments/${listing.listingId}`}>
                      <strong>{listing.name}</strong>
                      <small>{listing.symbol} · synthetic</small>
                    </Link>
                  </th>
                  <td>{listing.marketLabel}</td>
                  <td>
                    {listing.price} {listing.currency}
                  </td>
                  <td
                    className={listing.changePct >= 0 ? styles.up : styles.down}
                  >
                    {listing.changePct >= 0 ? "+" : ""}
                    {listing.changePct.toFixed(2)}%
                  </td>
                  <td>
                    <WatchlistToggle listingId={listing.listingId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
