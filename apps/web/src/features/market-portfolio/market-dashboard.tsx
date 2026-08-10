"use client";

import Link from "next/link";
import { useReducer } from "react";

import { WatchlistToggle } from "../../components/watchlist/watchlist-toggle";

import styles from "./market-portfolio.module.css";
import {
  marketBreadth,
  marketConcepts,
  marketIndices,
  marketMovements,
  marketTabs,
  syntheticListings,
  type MarketView,
  type RankingDirection,
} from "./synthetic-data";

export type MarketDashboardState = Readonly<{
  market: MarketView;
  ranking: RankingDirection;
}>;

export type MarketDashboardAction =
  | Readonly<{ type: "select-market"; market: MarketView }>
  | Readonly<{
      type: "select-ranking";
      ranking: RankingDirection;
    }>;

export const marketDashboardInitialState: MarketDashboardState = {
  market: "GLOBAL",
  ranking: "gainers",
};

export const marketDashboardReducer = (
  state: MarketDashboardState,
  action: MarketDashboardAction,
): MarketDashboardState => {
  switch (action.type) {
    case "select-market":
      return { ...state, market: action.market };
    case "select-ranking":
      return { ...state, ranking: action.ranking };
  }
};

const formatChange = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

type MiniTrendProperties = Readonly<{
  name: string;
  points: readonly number[];
  positive: boolean;
}>;

function MiniTrend({ name, points, positive }: MiniTrendProperties) {
  return (
    <svg
      aria-label={`${name}合成迷你趋势`}
      className={styles.miniTrend}
      role="img"
      viewBox="0 0 100 28"
    >
      <polyline
        fill="none"
        points={points
          .map((point, index) => `${index * 20},${point}`)
          .join(" ")}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        className={positive ? styles.up : styles.down}
      />
    </svg>
  );
}

type MarketDashboardProperties = Readonly<{
  initialState?: MarketDashboardState;
}>;

export function MarketDashboard({
  initialState = marketDashboardInitialState,
}: MarketDashboardProperties) {
  const [state, dispatch] = useReducer(marketDashboardReducer, initialState);
  const breadth = marketBreadth[state.market];
  const marketLabel =
    marketTabs.find((tab) => tab.id === state.market)?.label ?? "全球";
  const filteredListings = syntheticListings
    .filter(
      (listing) => state.market === "GLOBAL" || listing.market === state.market,
    )
    .toSorted((left, right) =>
      state.ranking === "gainers"
        ? right.changePct - left.changePct
        : left.changePct - right.changePct,
    );
  const total = breadth.advances + breadth.flat + breadth.declines;

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>MARKET PULSE · FIXED SNAPSHOT</p>
          <h2>行情中心</h2>
          <p>用一组固定合成快照观察市场结构、热度与异动。</p>
        </div>
        <div className={styles.disclosures}>
          <strong>演示数据 / 合成数据</strong>
          <span>不连接真实行情 · 不构成投资建议</span>
        </div>
      </header>

      <nav aria-label="行情市场切换" className={styles.segmented}>
        {marketTabs.map((tab) => (
          <button
            aria-pressed={state.market === tab.id}
            key={tab.id}
            onClick={() => dispatch({ type: "select-market", market: tab.id })}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <p aria-live="polite" className="visually-hidden">
        当前显示{marketLabel}
        {state.ranking === "gainers" ? "涨幅榜" : "跌幅榜"}
      </p>

      <section aria-labelledby="indices-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>{marketLabel} · SYNTHETIC</p>
            <h3 id="indices-heading">主要指数</h3>
          </div>
          <span>固定于 2026-08-08 14:00 CST</span>
        </div>
        <div className={styles.indexGrid}>
          {marketIndices[state.market].map((index) => (
            <article className={styles.indexCard} key={index.name}>
              <span>{index.name}</span>
              <strong>{index.price}</strong>
              <span className={index.changePct >= 0 ? styles.up : styles.down}>
                {formatChange(index.changePct)}
              </span>
              <MiniTrend
                name={index.name}
                points={index.trend}
                positive={index.changePct >= 0}
              />
            </article>
          ))}
        </div>
      </section>

      <div className={styles.insightGrid}>
        <section className={styles.panel} aria-labelledby="breadth-heading">
          <div className={styles.sectionHeading}>
            <h3 id="breadth-heading">市场涨跌家数</h3>
            <strong>{breadth.heat}° 市场热度</strong>
          </div>
          <div
            aria-label={`上涨 ${breadth.advances} 家，平盘 ${breadth.flat} 家，下跌 ${breadth.declines} 家`}
            className={styles.breadthBar}
            role="img"
          >
            <span
              className={styles.breadthUp}
              style={{ width: `${(breadth.advances / total) * 100}%` }}
            />
            <span
              className={styles.breadthFlat}
              style={{ width: `${(breadth.flat / total) * 100}%` }}
            />
            <span
              className={styles.breadthDown}
              style={{ width: `${(breadth.declines / total) * 100}%` }}
            />
          </div>
          <dl className={styles.breadthLegend}>
            <div>
              <dt>上涨</dt>
              <dd className={styles.up}>{breadth.advances}</dd>
            </div>
            <div>
              <dt>平盘</dt>
              <dd>{breadth.flat}</dd>
            </div>
            <div>
              <dt>下跌</dt>
              <dd className={styles.down}>{breadth.declines}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="concepts-heading">
          <h3 id="concepts-heading">热门行业 / 概念</h3>
          <ul className={styles.conceptList}>
            {marketConcepts[state.market].map((concept, index) => (
              <li key={concept.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{concept.name}</strong>
                <span
                  className={`${styles.conceptValue} ${
                    concept.value >= 0 ? styles.up : styles.down
                  }`}
                >
                  {formatChange(concept.value)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="movement-heading">
          <h3 id="movement-heading">市场异动</h3>
          <ol className={styles.movementList}>
            {marketMovements[state.market].map((movement) => (
              <li key={`${movement.at}-${movement.text}`}>
                <time>{movement.at}</time>
                <span>{movement.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="ranking-heading">
        <div className={styles.rankingHeading}>
          <div>
            <p className={styles.kicker}>HUOQIU-SYNTHETIC UNIVERSE</p>
            <h3 id="ranking-heading">
              {marketLabel}
              {state.ranking === "gainers" ? "涨幅榜" : "跌幅榜"}
            </h3>
          </div>
          <div className={styles.segmented} aria-label="涨跌幅榜切换">
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
        <div className={styles.rankingList}>
          {filteredListings.map((listing, index) => (
            <article className={styles.rankingRow} key={listing.listingId}>
              <span className={styles.rankNumber}>{index + 1}</span>
              <Link href={`/instruments/${listing.listingId}`}>
                <strong>{listing.name}</strong>
                <small>
                  {listing.symbol} · {listing.marketLabel} · 合成
                </small>
              </Link>
              <span>{listing.price}</span>
              <strong
                className={listing.changePct >= 0 ? styles.up : styles.down}
              >
                {formatChange(listing.changePct)}
              </strong>
              <WatchlistToggle listingId={listing.listingId} />
            </article>
          ))}
        </div>
        <div className={styles.panelFooter}>
          <span>共 {filteredListings.length} 个固定合成标的</span>
          <Link href="/markets/rankings">查看完整榜单 →</Link>
        </div>
      </section>
    </div>
  );
}
