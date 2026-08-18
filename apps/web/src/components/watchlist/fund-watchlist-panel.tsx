"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useFundWatchlist } from "../../stores/fund-watchlist";

type FundRow = Readonly<{
  category: string;
  code: string;
  dayPct: number | null;
  name: string;
  nav: number | null;
  navDate: string;
  oneYearPct: number | null;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; rows: readonly FundRow[] }>;

const EMPTY_FUNDS: readonly FundRow[] = [];

/*
 * 自选内部切 Tab 会卸载再挂载面板。排行是同一份真实公开数据，
 * 不必每次切回都重新请求；会话级缓存同时保留真实数据边界。
 */
let fundRowsCache: readonly FundRow[] | null = null;
let fundRowsRequest: Promise<readonly FundRow[]> | null = null;

const loadFundRows = (): Promise<readonly FundRow[]> => {
  if (fundRowsCache !== null) return Promise.resolve(fundRowsCache);
  fundRowsRequest ??= fetch(
    "/api/funds/list?category=hybrid&sort=oneYear&size=20",
  )
    .then(async (response) => {
      if (!response.ok) throw new Error("fund list unavailable");
      const data = (await response.json()) as { rows?: readonly FundRow[] };
      fundRowsCache = data.rows ?? [];
      return fundRowsCache;
    })
    .finally(() => {
      fundRowsRequest = null;
    });
  return fundRowsRequest;
};

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const tone = (value: number | null): string =>
  value === null || value === 0 ? "" : value > 0 ? "market-up" : "market-down";

export function FundWatchlistPanel() {
  const [state, setState] = useState<State>(() =>
    fundRowsCache === null
      ? { kind: "loading" }
      : { kind: "ready", rows: fundRowsCache },
  );
  const { add, addMany, codes, has, remove } = useFundWatchlist();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await loadFundRows();
        if (!cancelled) {
          setState({ kind: "ready", rows });
        }
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = state.kind === "ready" ? state.rows : EMPTY_FUNDS;
  const rowByCode = useMemo(
    () => new Map(rows.map((row) => [row.code, row])),
    [rows],
  );
  const selected = codes.map((code) => rowByCode.get(code) ?? { code });
  const recommendations = rows.slice(0, 6);

  return (
    <section
      className="fund-watchlist"
      aria-labelledby="fund-watchlist-heading"
    >
      <header className="fund-watchlist-heading">
        <div>
          <p>自选基金</p>
          <h1 id="fund-watchlist-heading">我的基金</h1>
        </div>
        <span>{codes.length} 只</span>
      </header>

      <section className="fund-watchlist-selected" aria-label="已选基金">
        <div className="fund-watchlist-section-title">
          <h2>已加入</h2>
          <span>保存在当前浏览器</span>
        </div>
        {selected.length === 0 ? (
          <p className="fund-watchlist-empty">
            还没有自选基金，可从下方真实排行中加入。
          </p>
        ) : (
          <ul>
            {selected.map((fund) => {
              const row = "name" in fund ? fund : null;
              return (
                <li key={fund.code}>
                  <Link href={`/funds/${fund.code}`}>
                    <strong>{row?.name ?? fund.code}</strong>
                    <small>
                      {row === null
                        ? fund.code
                        : `${row.category} · ${row.code}`}
                    </small>
                  </Link>
                  <span className={tone(row?.oneYearPct ?? null)}>
                    {row === null ? "—" : formatPercent(row.oneYearPct)}
                  </span>
                  <button onClick={() => remove(fund.code)} type="button">
                    移除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="fund-recommendations"
        aria-labelledby="fund-recommend-heading"
      >
        <div className="fund-watchlist-section-title">
          <div>
            <h2 id="fund-recommend-heading">排行推荐</h2>
            <p>天天基金公开排行 · 混合型 · 近一年</p>
          </div>
          {recommendations.length === 0 ? null : (
            <button
              className="fund-add-all"
              disabled={recommendations.every((fund) => has(fund.code))}
              onClick={() => addMany(recommendations.map((fund) => fund.code))}
              type="button"
            >
              一键加自选
            </button>
          )}
        </div>

        {state.kind === "loading" ? (
          <ul
            aria-label="正在读取真实基金排行"
            aria-busy="true"
            className="fund-recommendation-grid fund-recommendation-skeleton"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <li aria-hidden="true" key={index}>
                <span />
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : state.kind === "failed" ? (
          <p className="fund-watchlist-empty">
            基金排行暂时取不到，不使用模拟数据补位。
          </p>
        ) : (
          <ul className="fund-recommendation-grid">
            {recommendations.map((fund) => (
              <li key={fund.code}>
                <Link href={`/funds/${fund.code}`}>
                  <strong title={fund.name}>{fund.name}</strong>
                  <small>
                    {fund.category} · {fund.code}
                  </small>
                </Link>
                <span className={tone(fund.oneYearPct)}>
                  {formatPercent(fund.oneYearPct)}
                  <small>近一年</small>
                </span>
                <button
                  aria-label={`${has(fund.code) ? "移除" : "加入"}${fund.name}`}
                  className={has(fund.code) ? "is-selected" : ""}
                  onClick={() =>
                    has(fund.code) ? remove(fund.code) : add(fund.code)
                  }
                  type="button"
                >
                  {has(fund.code) ? "已加入" : "加自选"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
