"use client";

import { dayReturn } from "@huoqiu/domain/market/portfolio-return";

import { ScrollableTable } from "../../components/system/scrollable-table";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/*
 * 组合榜。
 *
 * 这里此前列的是十二条写死的样本组合（SYN001-012），带着编好的收益数字，
 * 而站内账号真实建过的组合一条也不在上面——点进去还是另一套样本数据。
 *
 * 现在列的就是本站账号建过的组合，收益按真实行情算：
 *   组合当日收益 = Σ(每只标的当日涨跌幅 × 该标的权重)
 * 任一持仓取不到行情就显示「—」：少算一只的加权和是错的，
 * 而错的结果看起来仍然像个正常的百分比。
 *
 * 没有人建过组合时这里就是空的。那也是实话，比凭空冒出十二条诚实。
 */

type Holding = Readonly<{ symbol: string; weight: number }>;

type PublicPortfolio = Readonly<{
  createdAt: string;
  followerCount: number;
  holdings: readonly Holding[];
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  summary: string;
}>;

type Quote = Readonly<{ changePercent: number | null; symbol: string }>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; portfolios: readonly PublicPortfolio[] }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

/* 模块级常量：每次渲染新建一个空 Map 会让下游的记忆化全部失效。 */
const EMPTY_QUOTES: ReadonlyMap<string, number | null> = new Map();

export function PortfolioLeaderboard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadedQuotes, setLoadedQuotes] = useState<
    ReadonlyMap<string, number | null>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/social/portfolios/public");
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          portfolios?: readonly PublicPortfolio[];
        };
        if (cancelled) return;
        setState({ kind: "ready", portfolios: data.portfolios ?? [] });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 榜上所有持仓合起来问一次行情，不要一个组合问一次。 */
  const symbols = useMemo(() => {
    if (state.kind !== "ready") return "";
    const all = state.portfolios.flatMap((portfolio) =>
      portfolio.holdings.map((holding) => holding.symbol),
    );
    return [...new Set(all)].join(",");
  }, [state]);

  useEffect(() => {
    /*
     * 没有持仓就不发请求，也不在这里清空：「没有标的就没有行情」是从
     * symbols 直接推得出来的，见下面 quotes 的推导。在 effect 里清一次，
     * 等于让同一件事有两个来源。
     */
    if (symbols.length === 0) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(symbols)}`,
        );
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { quotes?: readonly Quote[] };
        if (cancelled) return;
        setLoadedQuotes(
          new Map(
            (data.quotes ?? []).map((quote) => [
              quote.symbol,
              quote.changePercent,
            ]),
          ),
        );
      } catch {
        // 行情取不到时收益显示「—」，榜单本身照常可用。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  /* 没有持仓就没有行情——不必等 effect 去清一次。 */
  const quotes: ReadonlyMap<string, number | null> =
    symbols.length === 0 ? EMPTY_QUOTES : loadedQuotes;

  /*
   * 按当日收益排名。取不到行情的排在最后：
   * 把「不知道」当成 0 会让它插在涨的和跌的中间，看起来像是持平。
   */
  const ranked = useMemo(() => {
    if (state.kind !== "ready") return [];
    return state.portfolios
      .map((portfolio) => ({
        change: dayReturn(portfolio.holdings, quotes),
        portfolio,
      }))
      .toSorted((left, right) => {
        if (left.change === null && right.change === null) return 0;
        if (left.change === null) return 1;
        if (right.change === null) return -1;
        return right.change - left.change;
      });
  }, [quotes, state]);

  if (state.kind === "loading") {
    return (
      <section className="watchlist-panel" data-testid="portfolio-leaderboard">
        <h2>组合榜</h2>
        <p aria-live="polite" className="watchlist-hint">
          正在读取组合榜……
        </p>
      </section>
    );
  }

  if (state.kind === "failed") {
    return (
      <section className="watchlist-panel" data-testid="portfolio-leaderboard">
        <h2>组合榜</h2>
        <p className="watchlist-hint">组合榜暂时读取不到，稍后再试。</p>
      </section>
    );
  }

  return (
    <section className="watchlist-panel" data-testid="portfolio-leaderboard">
      <h2>组合榜</h2>
      {ranked.length === 0 ? (
        <p className="watchlist-hint">
          {/*
            说清楚是还没有人建过，而不是「加载失败」或者干脆空一块。
          */}
          还没有人建过组合。在上面「创建的」页签里建一个，它会出现在这里。
        </p>
      ) : (
        <ScrollableTable label="组合榜">
          <table className="watchlist-table">
            <caption className="watchlist-hint">
              按当日收益排名 · 共 {ranked.length} 个组合
            </caption>
            <thead>
              <tr>
                <th scope="col">组合</th>
                <th scope="col">持仓</th>
                <th className="watchlist-numeric" scope="col">
                  当日收益
                </th>
                <th className="watchlist-numeric" scope="col">
                  关注
                </th>
                <th scope="col">创建于</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ change, portfolio }) => (
                <tr key={portfolio.id}>
                  <th scope="row">
                    <Link href={`/portfolios/${portfolio.id}`}>
                      {portfolio.name}
                    </Link>
                    <small>
                      {portfolio.ownerName === "" ? (
                        "已注销账号"
                      ) : (
                        <Link href={`/users/${portfolio.ownerId}`}>
                          {portfolio.ownerName}
                        </Link>
                      )}
                    </small>
                  </th>
                  <td>
                    {portfolio.holdings
                      .map(
                        (holding) =>
                          `${holding.symbol.slice(2)} ${holding.weight.toString()}%`,
                      )
                      .join("、")}
                  </td>
                  <td className={`watchlist-numeric ${toneClass(change)}`}>
                    {formatPercent(change)}
                  </td>
                  <td className="watchlist-numeric">
                    {portfolio.followerCount}
                  </td>
                  <td>{portfolio.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
      <p className="watchlist-hint">
        组合只记录标的与权重，不涉及真实资金、下单或持仓，也不构成投资建议。
        当日收益按持仓权重对各标的当日涨跌幅加权得出，数据来自公开行情接口；
        任一持仓取不到行情时显示「—」。
      </p>
    </section>
  );
}
