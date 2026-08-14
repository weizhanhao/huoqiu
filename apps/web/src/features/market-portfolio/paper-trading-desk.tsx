"use client";

import Link from "next/link";
import { InstrumentLink } from "../../components/instrument/instrument-link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ScrollableTable } from "../../components/system/scrollable-table";
import { useAccountSession } from "../account/account-session";

import styles from "./market-portfolio.module.css";

/*
 * 模拟交易。
 *
 * 雪球的「交易」是券商对接，需要牌照和真实资金通道——那个做不了，也不该
 * 摆一个点不动的「开户」按钮假装做了。雪球同样有「模拟交易」，而那个能真做：
 * 价格用真实行情，盈亏照真实价格算，只有钱是虚拟的。
 *
 * 成交价不在这里填，也不由这里提交——下单只发代码、方向、数量三样，
 * 价格由服务端当场去行情接口取。让页面提交价格，等于「1 块钱买茅台」成立。
 */

/** 一手 100 股，和服务端一致。 */
const LOT_SIZE = 100;

type Position = Readonly<{
  averageCost: number;
  last: number | null;
  name: string | null;
  shares: number;
  symbol: string;
}>;

type Order = Readonly<{
  at: string;
  id: string;
  price: number;
  shares: number;
  side: "buy" | "sell";
  symbol: string;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      kind: "ready";
      orders: readonly Order[];
      positions: readonly Position[];
    }>
  | Readonly<{ kind: "signedOut" }>;

const yuan = (value: number): string =>
  value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

/** 未实现盈亏；现价取不到时返回 null，不拿成本价冒充。 */
const profitOf = (position: Position): number | null =>
  position.last === null
    ? null
    : (position.last - position.averageCost) * position.shares;

export function PaperTradingDesk() {
  const { account, authorizedFetch, loading } = useAccountSession();
  /*
   * 只存取数结果。「还在确认登录」与「没登录」都能从会话直接看出来，
   * 存一份副本就要负责同步，而没跟上的那一刻页面会说没登录。
   */
  const [fetched, setFetched] = useState<State>({ kind: "loading" });
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState(String(LOT_SIZE));
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await authorizedFetch("/api/trade", {
        cache: "no-store",
      });
      if (!response.ok) {
        setFetched({ kind: "failed" });
        return;
      }
      const data = (await response.json()) as {
        orders?: readonly Order[];
        positions?: readonly Position[];
      };
      setFetched({
        kind: "ready",
        orders: data.orders ?? [],
        positions: data.positions ?? [],
      });
    } catch {
      setFetched({ kind: "failed" });
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (loading || account === null) return undefined;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [account, loading, refresh]);

  const state: State = loading
    ? { kind: "loading" }
    : account === null
      ? { kind: "signedOut" }
      : fetched;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await authorizedFetch("/api/trade", {
        body: JSON.stringify({
          shares: Number(shares),
          side,
          // 不发价格：成交价由服务端取当前真实行情。
          symbol: symbol.trim().toLowerCase(),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        order?: Order;
      };
      if (!response.ok) {
        setMessage(data.error ?? "下单失败。");
        return;
      }
      const order = data.order;
      setMessage(
        order === undefined
          ? "已记录。"
          : `已按 ${yuan(order.price)} 元${
              order.side === "buy" ? "买入" : "卖出"
            } ${String(order.shares)} 股。`,
      );
      await refresh();
    } finally {
      setPending(false);
    }
  };

  const positions = state.kind === "ready" ? state.positions : [];
  const orders = state.kind === "ready" ? state.orders : [];

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>模拟交易</p>
          <h1>模拟交易</h1>
          <p>
            用真实行情记一笔虚拟买卖。价格由服务端按下单时的真实现价成交，
            盈亏照真实价格算——只有钱是虚拟的。
          </p>
        </div>
        {/*
          这句话原本写的是「本站不提供开户、下单或资产查询」——而它就印在
          下单表单和持仓表格的正上方。这一页做的正是下单与持仓查询，
          自己打自己的脸；读到的人会以为下面那个表单是摆设、数字是假的。
          要免的责是「不对接真实券商与真实资金」，把那层意思说准。
        */}
        <div className={styles.disclosures}>
          <strong>不涉及真实资金</strong>
          <span>不对接券商开户与资金账户，成交只记在本站账本上</span>
        </div>
      </header>

      {/* 一句常驻的状态播报，不随状态切换挂载卸载。 */}
      <p className={styles.resultStatus} role="status">
        {loading || state.kind === "loading"
          ? "正在读取账本……"
          : state.kind === "signedOut"
            ? "登录后可以使用模拟交易。"
            : state.kind === "failed"
              ? "账本暂时取不到。"
              : message.length > 0
                ? message
                : `当前持有 ${String(positions.length)} 只标的。`}
      </p>

      {state.kind === "signedOut" ? (
        <p className={styles.resultStatus}>
          <Link href="/login">去登录</Link>
        </p>
      ) : null}

      {state.kind === "signedOut" ? null : (
        <section aria-labelledby="order-heading" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2 id="order-heading">下单</h2>
            <span>按下单时的真实现价成交</span>
          </div>
          <form
            method="post"
            className={styles.filters}
            onSubmit={(event) => void submit(event)}
          >
            <label className="visually-hidden" htmlFor="trade-symbol">
              标的代码
            </label>
            <input
              id="trade-symbol"
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="sh600519"
              value={symbol}
            />
            <label className="visually-hidden" htmlFor="trade-shares">
              数量（股）
            </label>
            <input
              id="trade-shares"
              inputMode="numeric"
              onChange={(event) => setShares(event.target.value)}
              step={LOT_SIZE}
              type="number"
              value={shares}
            />
            <label className="visually-hidden" htmlFor="trade-side">
              买卖方向
            </label>
            <select
              id="trade-side"
              onChange={(event) =>
                setSide(event.target.value === "sell" ? "sell" : "buy")
              }
              value={side}
            >
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
            <button disabled={pending} type="submit">
              {pending ? "提交中…" : "按现价成交"}
            </button>
          </form>
        </section>
      )}

      {positions.length > 0 ? (
        <section aria-labelledby="positions-heading" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2 id="positions-heading">持仓</h2>
            <span>盈亏按当前真实价格计算</span>
          </div>
          <ScrollableTable label="模拟持仓">
            <table className="watchlist-table">
              <caption className={styles.resultStatus}>模拟持仓</caption>
              <thead>
                <tr>
                  <th scope="col">标的</th>
                  <th className="watchlist-numeric" scope="col">
                    持股
                  </th>
                  <th className="watchlist-numeric" scope="col">
                    成本价
                  </th>
                  <th className="watchlist-numeric" scope="col">
                    现价
                  </th>
                  <th className="watchlist-numeric" scope="col">
                    浮动盈亏
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => {
                  const profit = profitOf(position);
                  return (
                    <tr key={position.symbol}>
                      <th scope="row">
                        <InstrumentLink symbol={position.symbol}>
                          {position.name ?? position.symbol}
                          <small>{position.symbol.slice(2)}</small>
                        </InstrumentLink>
                      </th>
                      <td className="watchlist-numeric">{position.shares}</td>
                      <td className="watchlist-numeric">
                        {yuan(position.averageCost)}
                      </td>
                      <td className="watchlist-numeric">
                        {/* 现价取不到就说取不到，不拿成本价顶上。 */}
                        {position.last === null ? "—" : yuan(position.last)}
                      </td>
                      <td
                        className={`watchlist-numeric ${
                          profit === null || profit === 0
                            ? ""
                            : profit > 0
                              ? "watchlist-up"
                              : "watchlist-down"
                        }`}
                      >
                        {profit === null ? "—" : yuan(profit)}
                        {profit === null || profit === 0 ? null : (
                          <span className="visually-hidden">
                            （{profit > 0 ? "盈利" : "亏损"}）
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTable>
        </section>
      ) : null}

      {orders.length > 0 ? (
        <section aria-labelledby="orders-heading" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2 id="orders-heading">成交记录</h2>
            <span>最新的在最前</span>
          </div>
          <ScrollableTable label="模拟成交记录">
            <table className="watchlist-table">
              <caption className={styles.resultStatus}>模拟成交记录</caption>
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">标的</th>
                  <th scope="col">方向</th>
                  <th className="watchlist-numeric" scope="col">
                    数量
                  </th>
                  <th className="watchlist-numeric" scope="col">
                    成交价
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.at.slice(0, 16).replace("T", " ")}</td>
                    <th scope="row">{order.symbol}</th>
                    <td
                      className={
                        order.side === "buy" ? "watchlist-up" : "watchlist-down"
                      }
                    >
                      {order.side === "buy" ? "买入" : "卖出"}
                    </td>
                    <td className="watchlist-numeric">{order.shares}</td>
                    <td className="watchlist-numeric">{yuan(order.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </section>
      ) : null}
    </div>
  );
}
