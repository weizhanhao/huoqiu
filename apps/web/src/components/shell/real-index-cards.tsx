"use client";

import { useEffect, useState } from "react";
import { InstrumentLink } from "../instrument/instrument-link";

/*
 * 指数条上的真实指数卡。
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
  { name: "科创 50", symbol: "sh000688" },
  { name: "沪深 300", symbol: "sh000300" },
  { name: "中证 500", symbol: "sh000905" },
] as const;

const PAGE_SIZE = 3;
const AUTOPLAY_MS = 6000;
let indexCarouselPage = 0;

export type FxIndexCard = Readonly<{
  changePercent: number | null;
  code: string;
  label: string;
  source: string;
  value: number | null;
}>;

type Quote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string | null;
  symbol: string;
}>;

let indexQuoteCache: ReadonlyMap<string, Quote> | null = null;
let indexQuoteRequest: Promise<ReadonlyMap<string, Quote>> | null = null;

const loadIndexQuotes = async (): Promise<ReadonlyMap<string, Quote>> => {
  if (indexQuoteCache !== null) return indexQuoteCache;
  indexQuoteRequest ??= (async () => {
    const symbols = INDEX_CARDS.map((card) => card.symbol).join(",");
    const response = await fetch(
      `/api/market/quotes?symbols=${encodeURIComponent(symbols)}`,
    );
    if (!response.ok) throw new Error("index quotes unavailable");
    const data = (await response.json()) as { quotes?: readonly Quote[] };
    indexQuoteCache = new Map(
      (data.quotes ?? []).map((row) => [row.symbol, row]),
    );
    return indexQuoteCache;
  })().finally(() => {
    indexQuoteRequest = null;
  });
  return indexQuoteRequest;
};

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

const cardToneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? " index-card-up" : " index-card-down";
};

export function RealIndexCards({
  fxCards = [],
}: Readonly<{ fxCards?: readonly FxIndexCard[] }>) {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, Quote>>(
    () => indexQuoteCache ?? new Map(),
  );
  const [page, setPageState] = useState(indexCarouselPage);
  const [paused, setPaused] = useState(false);
  /*
   * 三种状态要分开，不能都写成「暂无数据」。
   *
   * 此前请求失败和「这只指数没有数据」共用一句话，于是 /markets 上指数条
   * 说上证指数「暂无数据」，正下方的 K 线却画着上证指数——同一屏自相矛盾，
   * 而真相是本站没能连上自己的接口。
   */
  const [phase, setPhase] = useState<"failed" | "loading" | "ready">(
    indexQuoteCache === null ? "loading" : "ready",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await loadIndexQuotes();
        if (cancelled) return;
        setQuotes(next);
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

  const cards = [
    ...INDEX_CARDS.map((card) => {
      const quote = quotes.get(card.symbol) ?? null;
      const changePercent = quote?.changePercent ?? null;

      return (
        <InstrumentLink
          className={`index-card${cardToneClass(changePercent)}`}
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
    }),
    ...fxCards.map((card) => (
      <div
        className={`index-card index-card-fx${cardToneClass(card.changePercent)}`}
        key={`fx-${card.code}`}
      >
        <span className="index-card-name">{card.label}</span>
        <strong className={toneClass(card.changePercent)}>
          {card.value === null ? "—" : card.value.toFixed(4)}
        </strong>
        <span className={toneClass(card.changePercent)}>
          {formatPercent(card.changePercent)}
        </span>
        <small>{card.source}</small>
      </div>
    )),
  ];
  const pageCount = Math.ceil(cards.length / PAGE_SIZE);
  const setPage = (next: number | ((current: number) => number)): void => {
    setPageState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      const normalized = (resolved + pageCount) % pageCount;
      indexCarouselPage = normalized;
      return normalized;
    });
  };

  useEffect(() => {
    if (paused || pageCount <= 1) return undefined;
    const timer = globalThis.setInterval(() => {
      setPageState((current) => {
        const next = (current + 1) % pageCount;
        indexCarouselPage = next;
        return next;
      });
    }, AUTOPLAY_MS);
    return () => globalThis.clearInterval(timer);
  }, [pageCount, paused]);

  const activeCards = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <section
        aria-label="市场概览"
        className="home-index-carousel market-index-carousel"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setPaused(false);
          }
        }}
        onFocus={() => setPaused(true)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <button
          aria-label="上一组指数"
          className="home-index-arrow home-index-arrow-prev"
          onClick={() => setPage((current) => current - 1)}
          type="button"
        >
          ‹
        </button>
        <div className="index-strip">{activeCards}</div>
        <button
          aria-label="下一组指数"
          className="home-index-arrow home-index-arrow-next"
          onClick={() => setPage((current) => current + 1)}
          type="button"
        >
          ›
        </button>
      </section>
      <div
        aria-label="选择指数分组"
        className="home-index-pagination market-index-pagination"
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            aria-label={`第${index + 1}组指数`}
            aria-pressed={page === index}
            key={index}
            onClick={() => setPage(index)}
            type="button"
          />
        ))}
      </div>
    </>
  );
}
