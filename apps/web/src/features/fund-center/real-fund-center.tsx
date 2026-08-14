"use client";

import { ScrollableTable } from "../../components/system/scrollable-table";
import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./fund-center.module.css";

/*
 * 基金中心。
 *
 * 这一页此前列的是六只写死的基金（fund_syn_0001…），名字、收益、规模全是编的；
 * 而站内唯一一只真实基金（110011）从列表里根本走不到——它只在直接输入地址
 * 时才存在。也就是说「基金」这个一级入口通向的内容全是假的。
 *
 * 现在列的是天天基金公开排行里的真实基金，每一行都通向它自己的详情页。
 * 分类和排序都由上游做：只把当前这一页重排，得到的是「这 20 只里的顺序」，
 * 却会被读成「全市场收益最高的 20 只」。
 */

const CATEGORIES = [
  { id: "hybrid", label: "混合型" },
  { id: "stock", label: "股票型" },
  { id: "index", label: "指数型" },
  { id: "bond", label: "债券型" },
  { id: "qdii", label: "QDII" },
] as const;

const SORTS = [
  { id: "oneYear", label: "近一年" },
  { id: "threeYear", label: "近三年" },
  { id: "yearToDate", label: "今年来" },
  { id: "day", label: "日涨幅" },
] as const;

/** 与取数层的一页条数对齐；不足一页就说明到底了。 */
const PAGE_SIZE = 20;

type CategoryId = (typeof CATEGORIES)[number]["id"];
type SortId = (typeof SORTS)[number]["id"];

type FundRow = Readonly<{
  category: string;
  code: string;
  dayPct: number | null;
  name: string;
  nav: number | null;
  navDate: string;
  oneYearPct: number | null;
  threeMonthPct: number | null;
  threeYearPct: number | null;
  yearToDatePct: number | null;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; rows: readonly FundRow[]; total: number | null }>;

const formatPercent = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatNav = (value: number | null): string =>
  value === null ? "—" : value.toFixed(4);

const toneClass = (value: number | null): string => {
  if (value === null || value === 0) return "watchlist-numeric";
  return `watchlist-numeric ${value > 0 ? "watchlist-up" : "watchlist-down"}`;
};

export function RealFundCenter({
  initialCategory = "hybrid",
  initialSort = "oneYear",
}: Readonly<{ initialCategory?: CategoryId; initialSort?: SortId }>) {
  const [category, setCategory] = useState<CategoryId>(initialCategory);
  const [sort, setSort] = useState<SortId>(initialSort);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
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
          `/api/funds/list?category=${category}&sort=${sort}&page=${page}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          rows?: readonly FundRow[];
          total?: number | null;
        };
        if (cancelled) return;
        setState({
          kind: "ready",
          rows: data.rows ?? [],
          total: data.total ?? null,
        });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, category, page, sort]);

  /*
   * 净值日期按行给，不用第一行代表整表。
   *
   * 此前取 rows[0].navDate 当作全表日期：债券型按日涨幅排时，第一行是一只
   * 停更四个月的基金，横幅于是写着 2026-04-08，而其余 19 行都是当天——
   * 一句话把 19 行的日期说错了。这里改成取最新的那个日期作为「最新净值日」，
   * 每一行再各自标注自己的日期。
   */
  const latestNavDate =
    state.kind === "ready"
      ? state.rows
          .map((row) => row.navDate)
          .filter((date) => date.length > 0)
          .toSorted()
          .at(-1)
      : undefined;

  return (
    <section
      aria-labelledby="fund-center-heading"
      className={styles.pageStack}
      data-testid="fund-center-hub"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>基金中心</p>
          <h1 id="fund-center-heading">基金中心</h1>
          <p>
            按公开排行浏览真实公募基金。
            {latestNavDate === undefined
              ? ""
              : `最新净值日 ${latestNavDate}；各行的净值日期见表内。`}
          </p>
        </div>
        <div className={styles.disclosure}>
          <strong>公开净值数据</strong>
          {/*
            站内没有基金销售牌照，做不了申购赎回。与其摆一个点了没反应的
            「购买」按钮，不如把做不了的事直接写出来。
          */}
          <span>不提供申购赎回 · 不构成投资建议</span>
        </div>
      </header>

      <section aria-labelledby="fund-list-heading" className={styles.panel} tabIndex={-1}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>FUND RANKING</p>
            <h2 id="fund-list-heading">基金排行</h2>
          </div>
          {state.kind === "ready" && state.total !== null ? (
            <span>共 {state.total} 只</span>
          ) : null}
        </div>

        <div className={styles.filters}>
          <div
            aria-label="基金分类"
            className={styles.segmented}
            role="group"
          >
            {CATEGORIES.map((item) => (
              <button
                aria-pressed={category === item.id}
                key={item.id}
                onClick={() => {
                  setCategory(item.id);
                  // 换分类要回到第一页，否则会停在上一类的第 5 页。
                  setPage(1);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div aria-label="排序依据" className={styles.segmented} role="group">
            {SORTS.map((item) => (
              <button
                aria-pressed={sort === item.id}
                key={item.id}
                onClick={() => {
                  setSort(item.id);
                  setPage(1);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/*
          常驻的播报区。此前它只在 loading 时挂出来——元素和文字同一帧进入
          DOM，多数读屏不会念；等结果回来它又被卸载了。现在它一直在，
          只换文字，所以切排序、切市场、失败都会被念出来。
        */}
        <p aria-live="polite" className={styles.resultStatus} role="status">
          {state.kind === "loading"
            ? "正在读取……"
            : state.kind === "failed"
              ? "基金列表取不到。"
              : `已列出 ${state.rows.length} 条。`}
        </p>

        {state.kind === "loading" ? (
          <p className={styles.resultStatus}>
            正在读取基金列表……
          </p>
        ) : null}

        {state.kind === "failed" ? (
          <p className={styles.resultStatus}>
            基金列表暂时取不到。{" "}
            <button
              /*
               * 重试会把这个按钮自己所在的容器卸载掉，焦点因此掉回 body——
               * 键盘用户被弹到文档顶端，得重新穿过整个页头、导航和右栏
               * 才能回来。所以先把焦点交给整块面板。
               */
              onClick={(event) => {
                event.currentTarget.closest("section")?.focus();
                setAttempt((current) => current + 1);
              }}
              type="button"
            >
              重试
            </button>
          </p>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <ScrollableTable label="基金排行">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th scope="col">基金</th>
                    <th className="watchlist-numeric" scope="col">
                      单位净值
                    </th>
                    <th scope="col">净值日</th>
                    <th className="watchlist-numeric" scope="col">
                      日涨幅
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      近三月
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      今年来
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      近一年
                    </th>
                    <th className="watchlist-numeric" scope="col">
                      近三年
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((fund) => (
                    <tr key={fund.code}>
                      <th scope="row">
                        <Link href={`/funds/${fund.code}`}>{fund.name}</Link>
                        <small>
                          {fund.category} · {fund.code}
                        </small>
                      </th>
                      <td className="watchlist-numeric">
                        {formatNav(fund.nav)}
                      </td>
                      <td>
                        {fund.navDate === "" ? "—" : fund.navDate}
                        {/*
                          日期比最新的旧，就说出来。此前整表共用第一行的日期，
                          于是一只停更四个月的基金能带着四个月前的涨幅
                          排在日涨幅榜第一，而横幅上写的还是它那天的日期。
                        */}
                        {latestNavDate !== undefined &&
                        fund.navDate !== "" &&
                        fund.navDate < latestNavDate ? (
                          <small>已停更</small>
                        ) : null}
                      </td>
                      <td className={toneClass(fund.dayPct)}>
                        {formatPercent(fund.dayPct)}
                      </td>
                      <td className={toneClass(fund.threeMonthPct)}>
                        {formatPercent(fund.threeMonthPct)}
                      </td>
                      <td className={toneClass(fund.yearToDatePct)}>
                        {formatPercent(fund.yearToDatePct)}
                      </td>
                      <td className={toneClass(fund.oneYearPct)}>
                        {formatPercent(fund.oneYearPct)}
                      </td>
                      <td className={toneClass(fund.threeYearPct)}>
                        {formatPercent(fund.threeYearPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>

            <div aria-label="翻页" className={styles.segmented} role="group">
              <button
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                上一页
              </button>
              <span className={styles.resultStatus}>第 {page} 页</span>
              <button
                /*
                 * 这一页不满一整页就说明到底了。上游没有「还有没有下一页」
                 * 这个信号，翻过去只会是一片空白。
                 */
                disabled={state.rows.length < PAGE_SIZE}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          </>
        ) : null}

        <p className={styles.resultStatus}>
          净值与收益来自天天基金公开排行接口，按上游净值日期计算；
          成立不满对应期限的基金该列显示「—」，不以 0 代替。
        </p>
      </section>
    </section>
  );
}
