"use client";

import { ScrollableTable } from "../../components/system/scrollable-table";
import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./market-portfolio.module.css";

/*
 * 涨跌榜。
 *
 * 这一页此前排的是站内那 35 个虚构标的，涨跌幅是写死的常量：切市场、
 * 切涨跌榜都有反应，但每一行都不是真的。
 *
 * 现在打公开行情列表接口。它和选股器不是一回事——选股器是 A 股筛选，
 * 带市盈率、换手这些条件；这一页是三个市场各自的涨跌榜。
 *
 * 排序与取前几名都由上游做：只对本页这几十行重排，得到的是
 * 「这几十只里的顺序」，却会被读成「全市场涨得最多的几十只」。
 */

const MARKETS = [
  { id: "cn", label: "沪深" },
  { id: "hk", label: "港股" },
  { id: "us", label: "美股" },
] as const;

const DIRECTIONS = [
  { id: "gainers", label: "涨幅榜" },
  { id: "losers", label: "跌幅榜" },
] as const;

type MarketId = (typeof MARKETS)[number]["id"];
type DirectionId = (typeof DIRECTIONS)[number]["id"];

/** 一页多少只。取数层把上限夹在 50。 */
const ROWS = 30;

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

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(3);

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

/* null 与 0 都不上色：把「取不到」显示成上涨，是把没有的数说成好消息。 */
const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

export function RealMarketRankings({
  initialDirection = "gainers",
  initialMarket = "cn",
}: Readonly<{
  initialDirection?: DirectionId;
  initialMarket?: MarketId;
}> = {}) {
  const [market, setMarket] = useState<MarketId>(initialMarket);
  const [direction, setDirection] = useState<DirectionId>(initialDirection);
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
          `/api/market/hot?market=${market}&direction=${direction}&rows=${ROWS}`,
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

  const marketLabel =
    MARKETS.find((entry) => entry.id === market)?.label ?? "沪深";
  const directionLabel =
    DIRECTIONS.find((entry) => entry.id === direction)?.label ?? "涨幅榜";

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          {/*
            这里原先是 kicker「榜单」+ 标题 + 一段说明。kicker 在重复左栏
            导航已经高亮的那一项；那段说明则是在回答一个没人问过的问题
            （「排序由谁完成」），反而让人怀疑排序有猫腻。
            表格第一列的名次已经说明了一切。
          */}
          <h1>涨跌榜</h1>
          <p>
            {marketLabel}
            {directionLabel}前 {ROWS} 名
          </p>
        </div>
        <div className={styles.disclosures}>
          <strong>
            {state.kind === "ready" && state.delayed
              ? "延时行情源"
              : "公开行情数据"}
          </strong>
          <span>非实时逐笔 · 不构成投资建议</span>
        </div>
      </header>

      <section className={styles.panel}>
        <div
          aria-label="榜单市场切换"
          className={styles.segmented}
          role="group"
        >
          {MARKETS.map((entry) => (
            <button
              aria-pressed={market === entry.id}
              key={entry.id}
              onClick={() => setMarket(entry.id)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div
          aria-label="榜单涨跌切换"
          className={styles.segmented}
          role="group"
        >
          {DIRECTIONS.map((entry) => (
            <button
              aria-pressed={direction === entry.id}
              key={entry.id}
              onClick={() => setDirection(entry.id)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>

        {state.kind === "loading" ? (
          <p aria-live="polite" className={styles.resultStatus}>
            正在读取榜单……
          </p>
        ) : null}

        {state.kind === "failed" ? (
          <p className={styles.resultStatus}>榜单暂时取不到。</p>
        ) : null}

        {state.kind === "ready" ? (
          <ScrollableTable label="涨跌榜">
            <table className="watchlist-table">
              <thead>
                <tr>
                  <th className="watchlist-numeric" scope="col">
                    #
                  </th>
                  <th scope="col">名称</th>
                  <th className="watchlist-numeric" scope="col">
                    最新价
                  </th>
                  <th className="watchlist-numeric" scope="col">
                    涨跌幅
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, index) => (
                  <tr key={row.code}>
                    <td className="watchlist-numeric">{index + 1}</td>
                    <th scope="row">
                      {/*
                        港美股与北交所没有站内详情页。照样给链接的话，
                        每一行都点得进去、每一次都是空页。
                      */}
                      {/*
                        名称与代码要放进同一个容器里。
                        原先 <small> 是 <a> 的兄弟节点，而「名称在上、代码在下」
                        那条堆叠规则只认 a 与 .watchlist-cell 里面的 strong 与 small
                        ——一条都匹配不上，于是代码以小一号的字紧贴在名字后面，
                        渲染成「网宿科技300017」「Artius II Acquisition Inc RtAACBR」，
                        看起来像排版坏了。自选页一直是嵌套写法，这里对齐它。
                      */}
                      {row.href === null ? (
                        <span className="watchlist-cell">
                          <strong>{row.name}</strong>
                          <small>{row.code}</small>
                        </span>
                      ) : (
                        <Link href={row.href}>
                          <strong>{row.name}</strong>
                          <small>{row.code}</small>
                        </Link>
                      )}
                    </th>
                    <td className="watchlist-numeric">
                      {formatPrice(row.last)}
                    </td>
                    <td
                      className={`watchlist-numeric ${toneClass(row.changePercent)}`}
                    >
                      {formatPercent(row.changePercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        ) : null}

        <p className={styles.resultStatus}>
          数据来自东方财富公开行情接口。港股与美股暂无站内详情页，
          那两个市场的行只显示名称，不给点不开的链接。
        </p>
      </section>
    </div>
  );
}
