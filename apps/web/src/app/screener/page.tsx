import type { Metadata } from "next";
import { InstrumentLink } from "../../components/instrument/instrument-link";
import Link from "next/link";

import { DesktopShell } from "../../components/shell/desktop-shell";
import styles from "../../features/real-finance/screener.module.css";
import {
  MAX_SCREENER_PAGE,
  PAGE_SIZE,
  SCREENER_MARKETS,
  SCREENER_SORTS,
  loadScreener,
  type ScreenerMarket,
  type ScreenerSort,
} from "../../server/screener.server";

/*
 * 火球选股器。
 *
 * 筛选状态全部放在地址里（sort / market / page / dir），不放组件内部 state：
 * 这样一页结果可以直接分享出去，浏览器后退也能回到上一次的筛选，
 * 而不是退回一个空白的默认视图。
 *
 * 排序和分页都由上游做——只对当前这一页重排，得到的是「这 20 只里的顺序」，
 * 却会被读成「全市场换手率最高的 20 只」。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "按涨跌幅、换手率、市盈率等口径筛选全部 A 股，数据来自公开行情接口",
  title: "火球选股器 · 火球",
};

const WAN = 10_000;
const YI = 100_000_000;

const formatYuan = (value: number | null): string => {
  if (value === null) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= YI) return `${(value / YI).toFixed(2)} 亿`;
  if (magnitude >= WAN) return `${(value / WAN).toFixed(2)} 万`;
  return value.toFixed(2);
};

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(2)}%`;

/** 市盈率为负是真实的（亏损），照实显示；没有则是「—」。 */
const formatRatio = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const isSort = (value: string | undefined): value is ScreenerSort =>
  value !== undefined && Object.hasOwn(SCREENER_SORTS, value);

const isMarket = (value: string | undefined): value is ScreenerMarket =>
  value !== undefined && Object.hasOwn(SCREENER_MARKETS, value);

const single = (
  value: string | readonly string[] | undefined,
): string | undefined =>
  Array.isArray(value) ? value[0] : (value as string | undefined);

type Filters = Readonly<{
  ascending: boolean;
  market: ScreenerMarket;
  page: number;
  sort: ScreenerSort;
}>;

type ScreenerPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<Record<string, string | string[] | undefined>>
  >;
}>;

/** 保留当前筛选，只改动其中一项——链接不该把别的选择清空。 */
const linkTo = (base: Filters, changes: Partial<Filters>): string => {
  /*
   * 逐项取值而不是展开 Partial：展开后每个字段的类型都带上 undefined，
   * URLSearchParams 不接受，而用 ?? 兜底又会把「显式传 false」吃掉。
   */
  const next: Filters = {
    ascending: changes.ascending ?? base.ascending,
    market: changes.market ?? base.market,
    page: changes.page ?? base.page,
    sort: changes.sort ?? base.sort,
  };
  const query = new URLSearchParams({
    market: next.market,
    page: String(next.page),
    sort: next.sort,
  });
  if (next.ascending) query.set("dir", "asc");
  return `/screener?${query.toString()}`;
};

/*
 * 涨跌配色。
 *
 * CSS Module 的类名在类型上可能是 undefined（比如样式里把类名拼错了），
 * 这时兜成空串——宁可这一格没有颜色，也不要在 class 属性里出现
 * "undefined" 这个字符串。
 */
/*
 * 抓取时刻按北京时间显示。
 *
 * 早先是 fetchedAt.slice(11, 16)，直接截 ISO 串里的 UTC 时分——
 * 一次 14:32 抓取会印成「06:32」。A 股 09:30–15:00 开市，06:32 不在任何
 * 交易时段内，读者会以为这份数据来路不明。
 */
const beijingTime = (iso: string): string => {
  const stamp = new Date(iso);
  if (!Number.isFinite(stamp.getTime())) return "—";
  return stamp.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  });
};

/** 缓存明显过期时要说出来，而不是让用户以为看到的是此刻的行情。 */
const STALE_AFTER_MS = 10 * 60 * 1000;

const isStale = (iso: string): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp > STALE_AFTER_MS;
};

const changeClass = (value: number | null): string => {
  if (value === null || value === 0) return "";
  return (value > 0 ? styles.up : styles.down) ?? "";
};

export default async function ScreenerPage({
  searchParams,
}: ScreenerPageProperties) {
  const parameters = await searchParams;
  const rawSort = single(parameters.sort);
  const rawMarket = single(parameters.market);
  const rawPage = Number(single(parameters.page) ?? "1");

  const sort: ScreenerSort = isSort(rawSort) ? rawSort : "change";
  const market: ScreenerMarket = isMarket(rawMarket) ? rawMarket : "all";
  const ascending = single(parameters.dir) === "asc";
  /*
   * 页码要夹在有效范围内。
   *
   * 早先只夹了下界，于是 ?page=9999 会让取数层拒绝请求、页面显示
   * 「行情数据暂时取不到」——把用户输错页码归咎于数据源故障。
   */
  const page =
    Number.isInteger(rawPage) && rawPage >= 1
      ? Math.min(rawPage, MAX_SCREENER_PAGE)
      : 1;

  const result = await loadScreener({ ascending, market, page, sort });
  const current: Filters = { ascending, market, page, sort };
  /* 上游没给总数时不编一个页数出来。 */
  const lastPage =
    result === null || result.total === null
      ? null
      : Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <DesktopShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>火球选股器</h1>
          <p className={styles.lead}>
            覆盖沪深主板、创业板与科创板全部 A
            股。排序与分页由数据源完成，因此每一页都是全市场排名，
            不是这一页内部的顺序。
          </p>
        </header>

        <nav aria-label="市场范围" className={styles.filters}>
          {Object.entries(SCREENER_MARKETS).map(([key, entry]) => (
            <Link
              aria-current={key === market ? "page" : undefined}
              className={`${styles.chip}${key === market ? ` ${styles.chipActive}` : ""}`}
              href={linkTo(current, {
                market: key as ScreenerMarket,
                page: 1,
              })}
              key={key}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="排序口径" className={styles.filters}>
          {Object.entries(SCREENER_SORTS).map(([key, entry]) => {
            const active = key === sort;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`${styles.chip}${active ? ` ${styles.chipActive}` : ""}`}
                href={linkTo(current, {
                  // 点当前列切换升降序，点别的列则从降序开始。
                  ascending: active ? !ascending : false,
                  page: 1,
                  sort: key as ScreenerSort,
                })}
                key={key}
              >
                {entry.label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </Link>
            );
          })}
        </nav>

        {result === null ? (
          /*
           * 说清楚是「取不到」。这一页从不使用样本数据填充——
           * 一张编出来的选股结果比一片空白危险得多。
           *
           * 但要分开两件事：翻过了最后一页，和数据源出故障。全市场约
           * 五千多只、每页二十只，两百八十页往后就没有内容了；对着一个
           * 手动改了页码的人说「数据源取不到」，是把他的输入错误说成故障。
           * 到底是哪一种这里判断不了——没有成功的响应就没有总数——
           * 所以两种可能都写出来，并给一条回到第一页的路。
           */
          <section className={styles.card}>
            <p className={styles.empty}>
              {page > 1
                ? "这一页没有内容：可能已经翻过了最后一页，也可能是数据源暂时取不到。"
                : "行情数据暂时取不到，稍后再试。"}
            </p>
            {page > 1 ? (
              <Link className={styles.chip} href={linkTo(current, { page: 1 })}>
                回到第一页
              </Link>
            ) : null}
          </section>
        ) : (
          <>
            <section className={styles.card}>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">代码</th>
                      <th scope="col">名称</th>
                      <th className={styles.numeric} scope="col">
                        最新价
                      </th>
                      <th className={styles.numeric} scope="col">
                        涨跌幅
                      </th>
                      <th className={styles.numeric} scope="col">
                        换手率
                      </th>
                      <th className={styles.numeric} scope="col">
                        市盈率 TTM
                      </th>
                      <th className={styles.numeric} scope="col">
                        市净率
                      </th>
                      <th className={styles.numeric} scope="col">
                        总市值
                      </th>
                      <th className={styles.numeric} scope="col">
                        成交额
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.symbol}>
                        <th scope="row">
                          <InstrumentLink
                            className={styles.symbol}
                            symbol={row.symbol}
                          >
                            {row.symbol.slice(2)}
                          </InstrumentLink>
                        </th>
                        <td>
                          <InstrumentLink
                            className={styles.symbol}
                            symbol={row.symbol}
                          >
                            {row.name ?? "—"}
                          </InstrumentLink>
                        </td>
                        <td className={styles.numeric}>
                          {row.last === null ? "—" : row.last.toFixed(2)}
                        </td>
                        <td
                          className={`${styles.numeric} ${changeClass(row.changePercent)}`}
                        >
                          {formatPercent(row.changePercent)}
                        </td>
                        <td className={styles.numeric}>
                          {formatPercent(row.turnoverPercent)}
                        </td>
                        <td className={styles.numeric}>
                          {formatRatio(row.peTtm)}
                        </td>
                        <td className={styles.numeric}>
                          {formatRatio(row.pb)}
                        </td>
                        <td className={styles.numeric}>
                          {formatYuan(row.marketCap)}
                        </td>
                        <td className={styles.numeric}>
                          {formatYuan(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <nav aria-label="翻页" className={styles.pager}>
              {page > 1 ? (
                <Link
                  className={styles.chip}
                  href={linkTo(current, { page: page - 1 })}
                >
                  上一页
                </Link>
              ) : (
                <span className={`${styles.chip} ${styles.chipDisabled}`}>
                  上一页
                </span>
              )}
              <span className={styles.pageInfo}>
                第 {page} 页
                {lastPage === null
                  ? ""
                  : ` / ${lastPage.toString()} 页 · 共 ${result.total?.toLocaleString("zh-CN") ?? ""} 只`}
              </span>
              {lastPage === null || page < lastPage ? (
                <Link
                  className={styles.chip}
                  href={linkTo(current, { page: page + 1 })}
                >
                  下一页
                </Link>
              ) : (
                <span className={`${styles.chip} ${styles.chipDisabled}`}>
                  下一页
                </span>
              )}
            </nav>

            <p className={styles.disclosure}>
              数据来源：东方财富公开行情接口 · 抓取于{" "}
              {beijingTime(result.fetchedAt)}（北京时间）
              {result.delayed ? " · 延时行情源" : ""}
              {isStale(result.fetchedAt)
                ? " · 上游暂时不可达，当前显示的是这一时刻的存档数据，并非最新行情"
                : ""}
              ，非实时逐笔，不构成投资建议。市盈率为负表示公司当期亏损；
              显示为「—」表示该指标不适用或未披露，不代表数值为零。
            </p>
          </>
        )}
      </div>
    </DesktopShell>
  );
}
