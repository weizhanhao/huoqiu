"use client";

import { InstrumentLink } from "../instrument/instrument-link";
import { useEffect, useState } from "react";

/*
 * 右栏热股榜。
 *
 * 对标雪球右栏的「热股榜」：带市场切换 + 涨跌榜切换。
 *
 * 数据此前是站内那 35 个虚构标的，涨跌幅是写死的常量：切市场、切涨跌榜
 * 都有反应，但每一行都不是真的。现在打的是公开行情列表接口，排序和取前
 * 几名都由上游做——只对本地这几行重排，得到的是「这几只里的顺序」，
 * 却会被读成「全市场涨得最多的几只」。
 *
 * 「全球」那一栏是三个市场一次问完、由上游在全集上排名，不是把三栏的前几名
 * 在本地拼起来——后者得到的是「这十几只里的顺序」，却会被读成「全球涨得
 * 最多的几只」，中间差着两万多只标的。
 */

const MARKETS = [
  { id: "cn", label: "沪深" },
  { id: "hk", label: "港股" },
  { id: "us", label: "美股" },
  { id: "global", label: "全球" },
] as const;

type MarketId = (typeof MARKETS)[number]["id"];
type Direction = "gainers" | "losers";

type HotRow = Readonly<{
  changePercent: number | null;
  code: string;
  href: string | null;
  last: number | null;
  name: string;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ delayed: boolean; kind: "ready"; rows: readonly HotRow[] }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const toneClass = (value: number | null): string | undefined => {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "market-up" : "market-down";
};

export function RailHotBoard() {
  const [market, setMarket] = useState<MarketId>("cn");
  const [direction, setDirection] = useState<Direction>("gainers");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      /*
       * 进「读取中」放在异步体的第一句，而不是 effect 的同步部分：
       * 同步改状态会在同一轮渲染里再触发一次。对用户没有分别——它和
       * 紧随其后的请求本来就是同一件事。
       */
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/market/hot?market=${market}&direction=${direction}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          delayed?: boolean;
          rows?: readonly HotRow[];
        };
        if (cancelled) return;
        setState({
          delayed: data.delayed ?? false,
          kind: "ready",
          rows: data.rows ?? [],
        });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, market]);

  return (
    <section className="rail-card" aria-labelledby="rail-hot-board-heading">
      <div className="rail-heading">
        <h2 id="rail-hot-board-heading">热股榜</h2>
        {/*
          走延时源时要说出来。一份晚十几分钟的真行情有用，
          但把它当成此刻的价就是另一回事了。
        */}
        <span>{state.kind === "ready" && state.delayed ? "延时" : "实时"}</span>
      </div>

      <div className="rail-tabs" role="group" aria-label="右栏热股榜市场切换">
        {MARKETS.map((item) => (
          <button
            aria-pressed={market === item.id}
            key={item.id}
            onClick={() => setMarket(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rail-chips" role="group" aria-label="右栏热股榜涨跌切换">
        {(
          [
            ["gainers", "涨幅榜"],
            ["losers", "跌幅榜"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={direction === id}
            key={id}
            onClick={() => setDirection(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {state.kind === "loading" ? (
        <p aria-live="polite" className="rail-empty">
          正在读取榜单……
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <p className="rail-empty">榜单暂时取不到。</p>
      ) : null}

      {state.kind === "ready" ? (
        <ol className="rail-rank">
          {state.rows.map((row, index) => (
            <li key={row.code}>
              <span className="rail-rank-index">{index + 1}</span>
              {/*
                沪深、港股、美股都有站内详情页了。北交所、新三板仍然没有，
                那几行照旧只给文字——先许诺点得进去、再给一张空页，
                比不给链接更糟。
              */}
              {row.href === null ? (
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.code}</small>
                </span>
              ) : (
                /*
                  接口给的是地址，链接组件要的是代码。取出来的若不是合法
                  代码，它会退回成纯文字，而不是给出一条坏链接。
                */
                <InstrumentLink symbol={row.href.replace("/instruments/", "")}>
                  <strong>{row.name}</strong>
                  <small>{row.code}</small>
                </InstrumentLink>
              )}
              <strong className={toneClass(row.changePercent)}>
                {formatPercent(row.changePercent)}
              </strong>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
