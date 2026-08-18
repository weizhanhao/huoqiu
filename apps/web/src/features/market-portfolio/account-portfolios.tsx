"use client";

import { dayReturn } from "@huoqiu/domain/market/portfolio-return";

import { ScrollableTable } from "../../components/system/scrollable-table";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./market-portfolio.module.css";

/*
 * 组合页签：我创建的、我关注的。
 *
 * 组合此前只活在 React state 里，刷新就没了。现在跟着账号落盘，
 * 所以这里要带令牌去取——未登录时说清楚是要登录，而不是显示成「你没有组合」。
 *
 * 当日收益由持仓的真实涨跌幅按权重加权得出，不是编的：
 *   组合当日收益 = Σ(每只标的当日涨跌幅 × 该标的权重)
 * 只要有一只标的取不到行情，整个组合的收益就显示「—」——
 * 缺一只算出来的加权和是错的，而它看起来仍然像个正常的百分比。
 */

type Holding = Readonly<{ symbol: string; weight: number }>;

type Portfolio = Readonly<{
  createdAt: string;
  holdings: readonly Holding[];
  id: string;
  name: string;
  ownerId: string;
  summary: string;
}>;

type Quote = Readonly<{ changePercent: number | null; symbol: string }>;

type State =
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      created: readonly Portfolio[];
      followed: readonly Portfolio[];
      kind: "ready";
    }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return value > 0 ? "watchlist-up" : "watchlist-down";
};

function PortfolioList({
  emptyHint,
  portfolios,
  quotes,
}: Readonly<{
  emptyHint: string;
  portfolios: readonly Portfolio[];
  quotes: ReadonlyMap<string, number | null>;
}>) {
  if (portfolios.length === 0) {
    return <p className={styles.accountPortfolioEmpty}>{emptyHint}</p>;
  }

  return (
    <ScrollableTable label="我的组合">
      <table className={`watchlist-table ${styles.accountPortfolioTable}`}>
        <thead>
          <tr>
            <th scope="col">组合名称</th>
            <th scope="col">持仓</th>
            <th className="watchlist-numeric" scope="col">
              当日收益
            </th>
            <th scope="col">创建于</th>
          </tr>
        </thead>
        <tbody>
          {portfolios.map((portfolio) => {
            const change = dayReturn(portfolio.holdings, quotes);
            return (
              <tr key={portfolio.id}>
                <th scope="row">
                  <Link href={`/portfolios/${portfolio.id}`}>
                    {portfolio.name}
                  </Link>
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
                <td>{portfolio.createdAt.slice(0, 10)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollableTable>
  );
}

/*
 * 新建组合。
 *
 * 没有这个表单的话，那个 POST 接口就没有任何入口——「创建的」页签对所有人
 * 永远是空的，而页签本身还在，那就是个空壳。
 *
 * 持仓按「代码 权重」逐行填，权重合计必须是 100：差几个百分点算出来的收益
 * 是错的，而页面上每一行看起来都很正常。
 */
function CreatePortfolio({ onCreated }: Readonly<{ onCreated: () => void }>) {
  const { authorizedFetch } = useAccountSession();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [rows, setRows] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setStatus("");

    /* 每行一条「代码 权重」，空行忽略。 */
    const holdings = rows
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [symbol = "", weight = ""] = line.split(/\s+/u);
        return { symbol: symbol.toLowerCase(), weight: Number(weight) };
      });

    if (holdings.some((holding) => !Number.isFinite(holding.weight))) {
      setStatus("每一行都要写成「代码 权重」，例如 sh600519 60。");
      return;
    }

    setPending(true);
    try {
      const response = await authorizedFetch("/api/social/portfolios", {
        body: JSON.stringify({ holdings, name, summary }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(data.error ?? "创建失败，请稍后再试。");
        return;
      }
      setStatus("组合已创建。");
      setName("");
      setSummary("");
      onCreated();
    } catch {
      setStatus("网络异常，请稍后再试。");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      method="post"
      className={styles.portfolioForm}
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.portfolioFormHeading}>
        <div>
          <h2>新建组合</h2>
          <p>组合跟随当前账号保存，持仓权重合计需为 100。</p>
        </div>
      </div>

      <div className={styles.portfolioFieldGrid}>
        <label htmlFor="portfolio-name">
          <span>组合名称</span>
          <input
            id="portfolio-name"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：长期观察组合"
            required
            type="text"
            value={name}
          />
        </label>

        <label htmlFor="portfolio-summary">
          <span>组合说明</span>
          <input
            id="portfolio-summary"
            maxLength={200}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="可选，简要说明组合思路"
            type="text"
            value={summary}
          />
        </label>
      </div>

      <label className={styles.portfolioHoldings} htmlFor="portfolio-holdings">
        <span>持仓与权重</span>
        <small>每行填写“证券代码 权重”，权重合计 100</small>
        <textarea
          id="portfolio-holdings"
          onChange={(event) => setRows(event.target.value)}
          placeholder={"每行一只证券，例如：\nsh600519 60\nsz300862 40"}
          rows={4}
          value={rows}
        />
      </label>

      <div className={styles.portfolioFormActions}>
        <button disabled={pending} type="submit">
          {pending ? "创建中…" : "创建组合"}
        </button>
      </div>

      {status === "" ? null : (
        <p aria-live="polite" className="watchlist-hint">
          {status}
        </p>
      )}
    </form>
  );
}

/** 只取数、不碰状态：effect、重试按钮与新建后的刷新共用同一段逻辑。 */
const fetchPortfolios = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<State> => {
  try {
    const response = await authorizedFetch("/api/social/portfolios");
    if (!response.ok) {
      return { kind: response.status === 401 ? "anonymous" : "failed" };
    }
    const data = (await response.json()) as {
      created?: readonly Portfolio[];
      followed?: readonly Portfolio[];
    };
    return {
      created: data.created ?? [],
      followed: data.followed ?? [],
      kind: "ready",
    };
  } catch {
    return { kind: "failed" };
  }
};

/* 模块级常量，理由同上：引用要稳定。 */
const ANONYMOUS: State = { kind: "anonymous" };

/* 模块级常量：每次渲染新建一个空 Map 会让下游的记忆化全部失效。 */
const EMPTY_QUOTES: ReadonlyMap<string, number | null> = new Map();

export function AccountPortfolios() {
  const { account, authorizedFetch } = useAccountSession();
  /* 「没登录」看 account 就够了，不必也存一份（见下面 state 的推导）。 */
  const [fetched, setFetched] = useState<State>({ kind: "loading" });
  const [loadedQuotes, setLoadedQuotes] = useState<
    ReadonlyMap<string, number | null>
  >(new Map());
  const [tab, setTab] = useState<"created" | "followed">("created");

  /* 重试按钮与新建组合后的刷新用这个；它不在 effect 里，就地改状态没问题。 */
  const load = useCallback(async (): Promise<void> => {
    setFetched({ kind: "loading" });
    setFetched(await fetchPortfolios(authorizedFetch));
  }, [authorizedFetch]);

  /*
   * 取数做成不碰状态的纯函数（见 fetchPortfolios），状态更新留在调用点——
   * effect 里的写入因此一定在 await 之后。顺带补上取消。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      setFetched({ kind: "loading" });
      const next = await fetchPortfolios(authorizedFetch);
      if (!cancelled) setFetched(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  /*
   * useMemo 是必要的，不是优化：下面的 symbols 以 state 为依赖，
   * 每次渲染新建一个 { kind: "anonymous" } 会让它每帧都重算，
   * 进而让取行情的 effect 每帧重跑一次。
   */
  const state: State = useMemo(
    () => (account === null ? ANONYMOUS : fetched),
    [account, fetched],
  );

  /* 两个页签里所有组合的持仓合起来问一次行情，不要一个组合问一次。 */
  const symbols = useMemo(() => {
    if (state.kind !== "ready") return "";
    const all = [...state.created, ...state.followed].flatMap((portfolio) =>
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
        // 行情取不到时收益显示「—」，组合列表本身照常可用。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  /* 没有持仓就没有行情——不必等 effect 去清一次。 */
  const quotes: ReadonlyMap<string, number | null> =
    symbols.length === 0 ? EMPTY_QUOTES : loadedQuotes;

  if (state.kind === "anonymous") {
    return (
      <section className="watchlist-panel" data-testid="account-portfolios">
        <p className="watchlist-hint">
          {/*
            说清楚是要登录，不是「你没有组合」——
            后者会让人以为自己建过的东西丢了。
          */}
          组合跟随账号保存。<Link href="/login">登录</Link>
          后可以看到你创建的与关注的组合。
        </p>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section className="watchlist-panel" data-testid="account-portfolios">
        <p aria-live="polite" className="watchlist-hint">
          正在读取组合……
        </p>
      </section>
    );
  }

  if (state.kind === "failed") {
    return (
      <section className="watchlist-panel" data-testid="account-portfolios">
        <p className="watchlist-hint">组合暂时读取不到，稍后再试。</p>
        <button onClick={() => void load()} type="button">
          重试
        </button>
      </section>
    );
  }

  return (
    <section
      className={`${styles.accountPortfolioPanel} watchlist-panel`}
      data-testid="account-portfolios"
    >
      <header className={styles.accountPortfolioHeading}>
        <div>
          <p>自选组合</p>
          <h1>我的组合</h1>
        </div>
        <span>{state.created.length + state.followed.length} 个</span>
      </header>
      <nav aria-label="组合分类" className={styles.portfolioTabs}>
        <button
          aria-pressed={tab === "created"}
          onClick={() => setTab("created")}
          type="button"
        >
          创建的 {state.created.length}
        </button>
        <button
          aria-pressed={tab === "followed"}
          onClick={() => setTab("followed")}
          type="button"
        >
          关注的 {state.followed.length}
        </button>
      </nav>

      {tab === "created" ? (
        <>
          <PortfolioList
            emptyHint="你还没有创建组合。"
            portfolios={state.created}
            quotes={quotes}
          />
          <CreatePortfolio onCreated={() => void load()} />
        </>
      ) : (
        <PortfolioList
          emptyHint="你还没有关注别人的组合。"
          portfolios={state.followed}
          quotes={quotes}
        />
      )}

      <p className={styles.portfolioNote}>
        当日收益按持仓权重对各标的当日涨跌幅加权得出；
        任一持仓取不到行情时显示「—」，不给出不完整的加权结果。
      </p>
    </section>
  );
}
