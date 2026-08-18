"use client";

import { ScrollableTable } from "../../components/system/scrollable-table";
import { InstrumentLink } from "../../components/instrument/instrument-link";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MarketChanges } from "./market-changes";

import styles from "./market-portfolio.module.css";

/*
 * 行情中心。
 *
 * 这一整块此前都是样本——「恒生样本指数」「全球航运」「星港制造」，点数、
 * 涨跌幅、概念热度全是写死的常量。站内最该是真数据的一页，反倒一个真数字
 * 都没有。
 *
 * 现在五块都来自公开行情接口：主要指数、沪深涨跌家数、行业板块、概念板块、
 * 盘口异动。
 *
 * 异动那一块我一度写成「免费接口返回 rc:102 拒绝服务，做不了」——那是错的：
 * 缺的只是一个请求参数。见 market-changes.tsx。
 */

type IndexQuote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string;
  symbol: string;
}>;

type Breadth = Readonly<{
  advancing: number;
  declining: number;
  unchanged: number;
}>;

type Sector = Readonly<{
  advancing: number;
  changePercent: number | null;
  code: string;
  declining: number;
  leaderHref: string | null;
  leaderName: string | null;
  name: string;
}>;

type Overview = Readonly<{
  breadth: Breadth | null;
  concepts: readonly Sector[];
  delayed: boolean;
  indexes: readonly IndexQuote[];
  industries: readonly Sector[];
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; overview: Overview }>;

const formatPoints = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

/*
 * null 与 0 都不上色。
 * 把「取不到」显示成上涨的颜色，是把没有的数说成好消息。
 */
const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

function SectorTable({
  caption,
  sectors,
}: Readonly<{ caption: string; sectors: readonly Sector[] }>) {
  if (sectors.length === 0) {
    return <p className={styles.resultStatus}>{caption}暂时取不到。</p>;
  }

  return (
    <ScrollableTable label={caption}>
      <table className="watchlist-table">
        <caption className={styles.resultStatus}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">板块</th>
            <th className="watchlist-numeric" scope="col">
              涨跌幅
            </th>
            <th className="watchlist-numeric" scope="col">
              涨 / 跌家数
            </th>
            <th scope="col">领涨股</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <tr key={sector.code}>
              <th scope="row">{sector.name}</th>
              <td
                className={`watchlist-numeric ${toneClass(sector.changePercent)}`}
              >
                {formatPercent(sector.changePercent)}
              </td>
              <td className="watchlist-numeric">
                {sector.advancing} / {sector.declining}
              </td>
              <td>
                {/*
                  站内渲染不出来的代码不给链接：先许诺点得进去、再给一张
                  空页，比不给链接更糟。
                */}
                {sector.leaderName === null ? (
                  "—"
                ) : sector.leaderHref === null ? (
                  sector.leaderName
                ) : (
                  <Link href={sector.leaderHref}>{sector.leaderName}</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}

export function RealMarketOverview() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/market/overview");
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const overview = (await response.json()) as Overview;
        if (cancelled) return;
        setState({ kind: "ready", overview });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const overview = state.kind === "ready" ? state.overview : null;
  const breadth = overview?.breadth ?? null;
  const breadthTotal =
    breadth === null
      ? 0
      : breadth.advancing + breadth.declining + breadth.unchanged;

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>行情</p>
          {/*
            这一页的标题在这里。它原本在被替换掉的样本看板里，
            不接过来这一页就一个 h1 都没有了。
          */}
          <h1>行情中心</h1>
          <p>
            沪深两市的实时指数、涨跌家数与板块表现，来自公开行情接口。
            涨跌家数含 B 股、不含北交所，且只统计当日有成交的证券。
          </p>
        </div>
        <div className={styles.disclosures}>
          <strong>
            {overview?.delayed === true ? "延时行情源" : "公开行情数据"}
          </strong>
        </div>
      </header>

      {state.kind === "loading" ? (
        <p aria-live="polite" className={styles.resultStatus}>
          正在读取行情……
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <p className={styles.resultStatus}>行情概览暂时取不到。</p>
      ) : null}

      {overview === null ? null : (
        <>
          <section aria-labelledby="indices-heading" className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2 id="indices-heading">主要指数</h2>
              <span>点进去是各自的日线与盘口</span>
            </div>
            <ScrollableTable label="主要指数">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th scope="col">指数</th>
                    <th className="watchlist-numeric" scope="col">
                      最新点数
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      涨跌幅
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.indexes.map((index) => (
                    <tr key={index.symbol}>
                      <th scope="row">
                        <InstrumentLink symbol={index.symbol}>
                          {index.name}
                        </InstrumentLink>
                      </th>
                      <td className="watchlist-numeric">
                        {formatPoints(index.last)}
                      </td>
                      <td
                        className={`watchlist-numeric ${toneClass(index.changePercent)}`}
                      >
                        {formatPercent(index.changePercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </section>

          {breadth === null ? null : (
            <section aria-labelledby="breadth-heading" className={styles.panel}>
              <div className={styles.sectionHeading}>
                <h2 id="breadth-heading">市场涨跌家数</h2>
                {/*
                  口径要写全。这个数是上证指数与深证成指两个指数的成分合计：
                  含 B 股、不含北交所，而且只统计当日有成交的——停牌的既不算
                  涨也不算跌。所以它是「今天动过的只数」，不是市场规模
                  （沪深实际上市 5663 只）。写成「共 N 只」会被读成后者。
                */}
                <span>沪深两市 · 当日有成交 {breadthTotal} 只</span>
              </div>
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>上涨</dt>
                  <dd className="market-up">{breadth.advancing}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>下跌</dt>
                  <dd className="market-down">{breadth.declining}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>平盘</dt>
                  <dd>{breadth.unchanged}</dd>
                </div>
              </dl>
            </section>
          )}

          <section aria-labelledby="sectors-heading" className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2 id="sectors-heading">板块表现</h2>
              <span>按涨跌幅排名</span>
            </div>
            <SectorTable caption="行业板块" sectors={overview.industries} />
            <SectorTable caption="概念板块" sectors={overview.concepts} />
          </section>

          {/*
            异动自己取数、自己刷新，不挂在 overview 那一次请求上：
            概览十分钟取一次就够，异动停十分钟就没用了。
          */}
          <MarketChanges />

        </>
      )}
    </div>
  );
}
