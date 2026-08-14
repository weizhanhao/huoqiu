"use client";

import { useEffect, useState } from "react";
import { InstrumentLink } from "../instrument/instrument-link";

/*
 * 指数条上的三张真实指数卡。
 *
 * 这三张此前是虚构指数——「火球全球 100」「全球成长」「全球价值」，点数和
 * 涨跌幅都是写死的常量，旁边还配了一条与任何数据无关的装饰走势线。
 * 进站第一眼看到的三个数字全是编的。
 *
 * 单独拆成客户端组件：整站外壳是同步的服务端组件，在里面 await 会让所有
 * 用 renderToStaticMarkup 渲染页面的测试直接失效。
 */

const INDEX_CARDS = [
  { name: "上证指数", symbol: "sh000001" },
  { name: "深证成指", symbol: "sz399001" },
  { name: "创业板指", symbol: "sz399006" },
] as const;

type Quote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string | null;
  symbol: string;
}>;

const formatPoints = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

/*
 * 涨跌配色。
 *
 * null 不上色。此前写的是 `changePct >= 0`，取不到值时一律按涨处理，
 * 于是一条读不到的行情会显示成上涨的颜色。
 */
const toneClass = (value: number | null): string | undefined => {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "market-up" : "market-down";
};

export function RealIndexCards() {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, Quote>>(new Map());
  /*
   * 三种状态要分开，不能都写成「暂无数据」。
   *
   * 此前请求失败和「这只指数没有数据」共用一句话，于是 /markets 上指数条
   * 说上证指数「暂无数据」，正下方的 K 线却画着上证指数——同一屏自相矛盾，
   * 而真相是本站没能连上自己的接口。
   */
  const [phase, setPhase] = useState<"failed" | "loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const symbols = INDEX_CARDS.map((card) => card.symbol).join(",");
      try {
        const response = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(symbols)}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          if (!cancelled) setPhase("failed");
          return;
        }
        const data = (await response.json()) as { quotes?: readonly Quote[] };
        if (cancelled) return;
        setQuotes(new Map((data.quotes ?? []).map((row) => [row.symbol, row])));
        setPhase("ready");
      } catch {
        // 取不到就保持「—」，不拿一个看起来正常的数字顶上。
        if (!cancelled) setPhase("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {INDEX_CARDS.map((card) => {
        const quote = quotes.get(card.symbol) ?? null;
        const changePercent = quote?.changePercent ?? null;

        return (
          <InstrumentLink
            className="index-card"
            key={card.symbol}
            symbol={card.symbol}
          >
            {/* 名字用上游给的，取不到才回落到本地写的那个。 */}
            <span className="index-card-name">{quote?.name ?? card.name}</span>
            <strong className={toneClass(changePercent)}>
              {formatPoints(quote?.last ?? null)}
            </strong>
            <span className={toneClass(changePercent)}>
              {formatPercent(changePercent)}
            </span>
            <small>
              {quote !== null
                ? "实时行情"
                : phase === "failed"
                  ? "行情取不到"
                  : phase === "loading"
                    ? "读取中"
                    : "暂无数据"}
            </small>
          </InstrumentLink>
        );
      })}
    </>
  );
}
