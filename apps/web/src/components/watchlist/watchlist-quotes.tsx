"use client";

import { ScrollableTable } from "../system/scrollable-table";
import { InstrumentLink } from "../instrument/instrument-link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { classifySymbol, type SymbolCategory } from "../../lib/symbol-category";

/*
 * 自选行情表：按品种分类 + 实时价。
 *
 * 此前自选行里的价格取自最后一根日线的收盘价——那是隔夜的陈价，
 * 盘中看着像「今天一动没动」。现在按需向 /api/market/quotes 取当前价。
 *
 * 分类只按代码本身判断（见 classifySymbol），认不出来的归「其他」。
 * 一个虚构标的被显示成 A 股，用户会以为它有真实行情。
 *
 * 页签只列**当前自选里真的有**的品种：摆一个永远空着的页签，
 * 看起来像功能坏了，而不是像「你还没关注这一类」。
 */

type Quote = Readonly<{
  changeAmount: number | null;
  changePercent: number | null;
  last: number | null;
  name: string | null;
  symbol: string;
}>;

type FetchState =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; quotes: readonly Quote[] }>;

const CATEGORY_LABELS: Readonly<Record<SymbolCategory, string>> = {
  fund: "基金",
  index: "指数",
  other: "其他",
  stock: "沪深",
};

/** 页签顺序固定，不随自选内容变来变去。 */
const CATEGORY_ORDER: readonly SymbolCategory[] = [
  "stock",
  "index",
  "fund",
  "other",
];

const ALL = "全部";

const formatPrice = (value: number | null): string =>
  value === null ? "—" : value.toFixed(value < 10 ? 3 : 2);

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatAmount = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

/* 模块级常量：每次渲染新建一个空数组会让下游的 useMemo 全部失效。 */
const NO_QUOTES: readonly Quote[] = [];

/** 只取数、不碰状态：effect 与重试按钮共用同一段逻辑。 */
const fetchQuotes = async (key: string): Promise<FetchState> => {
  if (key.length === 0) return { kind: "ready", quotes: [] };
  try {
    const response = await fetch(
      `/api/market/quotes?symbols=${encodeURIComponent(key)}`,
    );
    if (!response.ok) return { kind: "failed" };
    const data = (await response.json()) as { quotes?: readonly Quote[] };
    return { kind: "ready", quotes: data.quotes ?? [] };
  } catch {
    return { kind: "failed" };
  }
};

export function WatchlistQuotes({
  symbols,
}: Readonly<{ symbols: readonly string[] }>) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [active, setActive] = useState<string>(ALL);

  /*
   * 依赖用的是拼好的字符串而不是数组本身。
   * 数组每次渲染都是新引用，直接当依赖会让这个 effect 每帧都重跑一次。
   */
  const key = useMemo(() => symbols.join(","), [symbols]);

  /*
   * 重试按钮用这个：按钮回调不在 effect 里，就地改状态没有问题。
   */
  const load = useCallback(async (): Promise<void> => {
    setState({ kind: "loading" });
    setState(await fetchQuotes(key));
  }, [key]);

  /*
   * 首次与依赖变化时的取数。
   *
   * 取数本身做成不碰状态的纯函数，写状态因此一定在 await 之后。顺带补上
   * 取消：原先没有，快速切换分组时先发的请求后到，会把上一组的行情盖到
   * 这一组上——两边都是真数据，看不出错。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ kind: "loading" });
      const next = await fetchQuotes(key);
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const quotes = state.kind === "ready" ? state.quotes : NO_QUOTES;

  /* 只列出当前自选里真的存在的品种。 */
  const presentCategories = useMemo(() => {
    const present = new Set(
      quotes.map((quote) => classifySymbol(quote.symbol)),
    );
    return CATEGORY_ORDER.filter((category) => present.has(category));
  }, [quotes]);

  /*
   * 把「没出现在结果里」的标的按成因分开。
   * 认得出形状但上游没给的，和站内那些根本没有行情源的，是两回事。
   */
  const missing = useMemo(() => {
    const returned = new Set(quotes.map((quote) => quote.symbol));
    const absent = symbols.filter((symbol) => !returned.has(symbol));
    const synthetic = absent.filter(
      (symbol) => classifySymbol(symbol) === "other",
    ).length;
    return {
      synthetic,
      total: absent.length,
      unresolved: absent.length - synthetic,
    };
  }, [quotes, symbols]);

  const visible = useMemo(
    () =>
      active === ALL
        ? quotes
        : quotes.filter(
            (quote) => CATEGORY_LABELS[classifySymbol(quote.symbol)] === active,
          ),
    [active, quotes],
  );

  /*
   * 自选为空时什么都不渲染。
   *
   * 外层面板已经给了空态；这里再给一条，同一句话会连着出现两遍。
   * 早先两条措辞还不一样——一条说「从演示标的详情加入」、一条说
   * 「在任意标的页点加自选」，读起来像两个不同的功能。
   */
  if (symbols.length === 0) return null;

  if (state.kind === "failed") {
    return (
      <div className="watchlist-quotes">
        {/*
          说清楚是取不到，而不是显示一列空白价格——
          空白会被读成「这些标的没有行情」。
        */}
        <p className="watchlist-hint">
          行情暂时取不到，稍后再试。本表不使用样本数据代替真实行情。
        </p>
        <button onClick={() => void load()} type="button">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="watchlist-quotes" data-testid="watchlist-quotes">
      <nav aria-label="自选品种" className="watchlist-categories">
        <button
          aria-pressed={active === ALL}
          onClick={() => setActive(ALL)}
          type="button"
        >
          {ALL} {quotes.length}
        </button>
        {presentCategories.map((category) => {
          const label = CATEGORY_LABELS[category];
          const count = quotes.filter(
            (quote) => classifySymbol(quote.symbol) === category,
          ).length;
          return (
            <button
              aria-pressed={active === label}
              key={category}
              onClick={() => setActive(label)}
              type="button"
            >
              {label} {count}
            </button>
          );
        })}
      </nav>

      {state.kind === "loading" ? (
        <p aria-live="polite" className="watchlist-hint">
          正在读取行情……
        </p>
      ) : null}

      <ScrollableTable label="自选实时行情">
        <table className="watchlist-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">代码</th>
              <th className="watchlist-numeric" scope="col">
                最新价
              </th>
              <th className="watchlist-numeric" scope="col">
                涨跌额
              </th>
              <th className="watchlist-numeric" scope="col">
                涨跌幅
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((quote) => (
              <tr key={quote.symbol}>
                <th scope="row">
                  <InstrumentLink symbol={quote.symbol}>
                    {quote.name ?? quote.symbol}
                  </InstrumentLink>
                </th>
                <td>{quote.symbol.slice(2)}</td>
                <td className="watchlist-numeric">{formatPrice(quote.last)}</td>
                <td
                  className={`watchlist-numeric ${toneClass(quote.changeAmount)}`}
                >
                  {formatAmount(quote.changeAmount)}
                </td>
                <td
                  className={`watchlist-numeric ${toneClass(quote.changePercent)}`}
                >
                  {formatPercent(quote.changePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTable>

      {state.kind === "ready" && missing.total > 0 ? (
        /*
         * 少掉的标的分两种，不能混为一谈：
         *   一种是站内的样本标的，本来就没有公开行情来源；
         *   一种是形状合法但上游没返回的代码（查无此股、或已摘牌）。
         * 早先一律说成「站内样本标的」，把「查不到」说成了「我们自己造的」。
         */
        <p className="watchlist-hint">
          {missing.synthetic > 0
            ? `自选中有 ${missing.synthetic.toString()} 个站内样本标的，没有公开行情来源，未列入上表。`
            : ""}
          {missing.unresolved > 0
            ? `另有 ${missing.unresolved.toString()} 个代码在行情源中查不到，可能已摘牌或代码有误。`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
