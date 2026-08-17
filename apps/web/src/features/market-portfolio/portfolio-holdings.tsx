"use client";

import { dayReturn } from "@huoqiu/domain/market/portfolio-return";

import { ScrollableTable } from "../../components/system/scrollable-table";
import { InstrumentLink } from "../../components/instrument/instrument-link";
import { useEffect, useState } from "react";

/*
 * 一个组合的持仓，配当下的真实行情。
 *
 * 组合详情页此前只列代码和权重，一个价都没有——看不出这个组合今天是涨是跌。
 * 而旁边那套样本组合页给的收益是编好的常量。
 *
 * 这里的每一个数都来自公开行情接口：
 *   组合当日收益 = Σ(每只标的当日涨跌幅 × 该标的权重)
 * 任一持仓取不到行情，合计就显示「—」——少算一只的加权和是错的，
 * 而错的结果看起来仍然像个正常的百分比。
 */

type Holding = Readonly<{ symbol: string; weight: number }>;

type Quote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string | null;
  symbol: string;
}>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

export function PortfolioHoldings({
  holdings,
}: Readonly<{ holdings: readonly Holding[] }>) {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, Quote>>(new Map());
  const [failed, setFailed] = useState(false);

  const symbols = holdings.map((holding) => holding.symbol).join(",");

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(symbols)}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const data = (await response.json()) as { quotes?: readonly Quote[] };
        if (cancelled) return;
        setQuotes(new Map((data.quotes ?? []).map((row) => [row.symbol, row])));
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  /* 任一持仓缺行情，合计就是 null。算法与组合榜、我的组合同源。 */
  const total = dayReturn(
    holdings,
    new Map(
      [...quotes].map(([symbol, quote]) => [symbol, quote.changePercent]),
    ),
  );

  return (
    <>
      <ScrollableTable label="组合持仓">
        <table className="watchlist-table">
          <thead>
            <tr>
              <th scope="col">标的</th>
              <th className="watchlist-numeric" scope="col">
                权重
              </th>
              <th className="watchlist-numeric" scope="col">
                最新价
              </th>
              <th className="watchlist-numeric" scope="col">
                当日涨跌
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => {
              const quote = quotes.get(holding.symbol);
              return (
                <tr key={holding.symbol}>
                  <th scope="row">
                    <InstrumentLink symbol={holding.symbol}>
                      {quote?.name ?? holding.symbol.slice(2)}
                    </InstrumentLink>
                    <small>{holding.symbol.slice(2)}</small>
                  </th>
                  <td className="watchlist-numeric">
                    {holding.weight.toFixed(2)}%
                  </td>
                  <td className="watchlist-numeric">
                    {formatPrice(quote?.last ?? null)}
                  </td>
                  <td
                    className={`watchlist-numeric ${toneClass(
                      quote?.changePercent ?? null,
                    )}`}
                  >
                    {formatPercent(quote?.changePercent ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">组合当日收益</th>
              <td className="watchlist-numeric">100.00%</td>
              <td />
              <td className={`watchlist-numeric ${toneClass(total)}`}>
                {formatPercent(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </ScrollableTable>
      {failed ? (
        <p aria-live="polite" className="watchlist-hint">
          行情暂时取不到，上面只显示了权重。
        </p>
      ) : null}
    </>
  );
}
