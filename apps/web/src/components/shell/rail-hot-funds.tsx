"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * 右栏「热门基金」。
 *
 * 这里此前列的是站内那六只写死的基金（fund_syn_0001…），名字和收益都是编的。
 * 现在按近一年收益从公开排行里取前几只，每一行都通向它自己的真实详情页。
 */

const ROWS = 3;

type FundRow = Readonly<{
  category: string;
  code: string;
  name: string;
  oneYearPct: number | null;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; rows: readonly FundRow[] }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const toneClass = (value: number | null): string | undefined => {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "market-up" : "market-down";
};

export function RailHotFunds() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/funds/list?category=hybrid&sort=oneYear&size=${ROWS}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as { rows?: readonly FundRow[] };
        if (cancelled) return;
        setState({ kind: "ready", rows: data.rows ?? [] });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rail-card">
      <div className="rail-heading">
        <h2>热门基金</h2>
        <span>近一年</span>
      </div>

      {state.kind === "loading" ? (
        <p aria-live="polite" className="rail-empty">
          正在读取基金……
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <p className="rail-empty">基金榜暂时取不到。</p>
      ) : null}

      {state.kind === "ready"
        ? state.rows.map((fund) => (
            <Link
              className="fund-row"
              href={`/funds/${fund.code}`}
              key={fund.code}
            >
              <span>
                <strong>{fund.name}</strong>
                <small>
                  {fund.category} · {fund.code}
                </small>
              </span>
              <strong className={toneClass(fund.oneYearPct)}>
                {formatPercent(fund.oneYearPct)}
              </strong>
            </Link>
          ))
        : null}
    </section>
  );
}
