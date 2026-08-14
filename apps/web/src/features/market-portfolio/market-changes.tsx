"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ScrollableTable } from "../../components/system/scrollable-table";

import styles from "./market-portfolio.module.css";

/*
 * 盘口异动。
 *
 * 我上一轮在这一页写了「免费的异动接口不再提供服务」，还据此删掉了整块。
 * 那个结论是错的——接口好好的，缺的只是一个参数。这一块因此补回来。
 *
 * 自动刷新 30 秒一次，页面切到后台时停：异动列表是分钟级的东西，
 * 停在十分钟前的样子比不显示更容易误导。而在没人看的标签页里
 * 每 30 秒打一次上游，只是白白挨限流。
 */

/** 自动刷新间隔。 */
const REFRESH_MS = 30_000;

type Change = Readonly<{
  at: string;
  code: string;
  href: string | null;
  label: string;
  name: string;
  tone: "down" | "up";
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; rows: readonly Change[]; total: number | null }>
  /** 刷新失败但手上还有上一批数据：继续显示它们，并说明是旧的。 */
  | Readonly<{ kind: "stale"; rows: readonly Change[] }>;

/** 取数的结果；被取消时回 null，让调用方原地不动。 */
type ChangesOutcome =
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "ok"; rows: readonly Change[]; total: number | null }>;

/** 只取数、不碰状态。 */
const fetchChanges = async (
  signal: AbortSignal,
): Promise<ChangesOutcome | null> => {
  try {
    const response = await fetch("/api/market/changes", { signal });
    if (signal.aborted) return null;
    if (!response.ok) return { kind: "error" };
    const data = (await response.json()) as {
      rows?: readonly Change[];
      total?: number | null;
    };
    if (signal.aborted) return null;
    return { kind: "ok", rows: data.rows ?? [], total: data.total ?? null };
  } catch {
    return signal.aborted ? null : { kind: "error" };
  }
};

export function MarketChanges() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    /*
     * 取数做成不碰状态的纯函数（见 fetchChanges），状态更新留在这里——
     * 因此一定发生在 await 之后，不会在同一轮渲染里再触发一次。
     */
    const refresh = async (): Promise<void> => {
      const outcome = await fetchChanges(controller.signal);
      if (outcome === null) return;
      if (outcome.kind === "ok") {
        setState({ kind: "ready", rows: outcome.rows, total: outcome.total });
        return;
      }
      /*
       * 刷新失败时不要把已有的表丢掉。
       *
       * 原先一失败就整体切到 failed，`ready` 分支为假，整张表连同它的滚动
       * 容器一起从 DOM 上卸载——焦点如果正停在某一行的链接上，会直接掉回
       * body，读屏从头开始念，而且没有任何一句话说明发生了什么。
       *
       * 对读屏用户来说，「数据旧了一点」远比「数据整块消失」好。
       */
      setState((previous) => {
        const rows =
          previous.kind === "ready" || previous.kind === "stale"
            ? previous.rows
            : [];
        return rows.length === 0 ? { kind: "failed" } : { kind: "stale", rows };
      });
    };

    void refresh();

    const timer = setInterval(() => {
      // 暂停了就不刷。这是给读屏与放大镜用户的：列表每 30 秒重绘一次，
      // 正在逐行读的人会一直丢失阅读位置。
      if (paused) return;
      // 后台标签页不刷新——省下的那次请求换不来任何人看得见的东西。
      if (globalThis.document?.visibilityState === "hidden") return;
      void refresh();
    }, REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [paused]);

  const rows =
    state.kind === "ready" || state.kind === "stale" ? state.rows : [];

  /*
   * 一句常驻的状态播报，不随状态切换而挂载/卸载。
   *
   * 原先每个状态各自渲染一个 <p aria-live>，容器和文字同时插进 DOM——
   * live region 的语义是「已存在的容器内容变了才播报」，容器本身是新出现的
   * 那一刻，各家读屏的处理并不一致，实测经常完全不播。
   */
  const statusText =
    state.kind === "loading"
      ? "正在读取异动……"
      : state.kind === "failed"
        ? "异动暂时取不到。本页不以估算或样本数据代替。"
        : state.kind === "stale"
          ? "异动刷新失败，下面是上一次取到的数据。"
          : `已列出 ${rows.length} 条异动。`;

  return (
    <section aria-labelledby="changes-heading" className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2 id="changes-heading">盘口异动</h2>
        <span>
          {state.kind === "ready" && state.total !== null
            ? `当日 ${state.total} 条`
            : "盘口异动"}
        </span>
        {/*
          自动刷新要能停下。
          这一块每 30 秒整体重绘，正在逐行读的读屏用户和用放大镜的人会一直
          丢失阅读位置——WCAG 2.2.2 是 A 级要求，不是可选项。
        */}
        <button
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
          type="button"
        >
          {paused ? "已暂停刷新" : "每 30 秒刷新"}
        </button>
      </div>

      {/*
        常驻的状态播报。不随状态切换挂载/卸载，否则 live region 与它的文字
        同时出现，多数读屏根本不播。
      */}
      <p className={styles.resultStatus} role="status">
        {statusText}
      </p>

      {rows.length > 0 ? (
        <ScrollableTable label="盘口异动">
          <table aria-describedby="changes-note" className="watchlist-table">
            {/* caption 是表名，说明另放——读屏的表格列表里念的就是 caption。 */}
            <caption className={styles.resultStatus}>盘口异动</caption>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">股票</th>
                <th scope="col">异动类型</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.at}-${row.code}-${row.label}`}>
                  <td className="watchlist-numeric">{row.at}</td>
                  <th scope="row">
                    {/*
                      站内渲染不出来的代码不给链接。北交所的票也会出现在
                      异动里——照样给链接的话，点得进去、点进去是空页。
                    */}
                    {row.href === null ? (
                      // watchlist-cell：没有链接的那几行也要和有链接的排版一致。
                      <span className="watchlist-cell">
                        {row.name} <small>{row.code}</small>
                      </span>
                    ) : (
                      <Link href={row.href}>
                        {row.name} <small>{row.code}</small>
                      </Link>
                    )}
                  </th>
                  <td
                    className={
                      row.tone === "up" ? "watchlist-up" : "watchlist-down"
                    }
                  >
                    {row.label}
                    {/*
                      方向不能只靠颜色。
                      多数标签自带方向（「火箭发射」「加速下跌」），但有几个
                      正好相反：「打开跌停板」算偏多、「打开涨停板」算偏空，
                      「向上/向下缺口」「高开/低开5日线」也只有颜色能区分。
                      读屏听到「打开涨停板」不会知道行情源把它判为偏空，
                      色觉障碍的人看到的则是两种差不多的深灰。
                    */}
                    <span className="visually-hidden">
                      （{row.tone === "up" ? "偏多" : "偏空"}）
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      ) : null}

      {/* 表的说明放在表外，由 aria-describedby 关联；caption 只留表名。 */}
      {rows.length > 0 ? (
        <p className={styles.resultStatus} id="changes-note">
          最新的在最前。异动类型由行情源判定。
        </p>
      ) : null}
    </section>
  );
}
