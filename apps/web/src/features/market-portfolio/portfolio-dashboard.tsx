"use client";

import Link from "next/link";
import { useReducer } from "react";

import styles from "./market-portfolio.module.css";
import { syntheticPortfolios, type PortfolioPeriod } from "./synthetic-data";

export type PortfolioDashboardState = Readonly<{
  period: PortfolioPeriod;
}>;

export type PortfolioDashboardAction = Readonly<{
  type: "select-period";
  period: PortfolioPeriod;
}>;

export const portfolioDashboardInitialState: PortfolioDashboardState = {
  period: "day",
};

export const portfolioDashboardReducer = (
  state: PortfolioDashboardState,
  action: PortfolioDashboardAction,
): PortfolioDashboardState => {
  if (action.type === "select-period") {
    return { period: action.period };
  }
  return state;
};

const periodLabels: Readonly<Record<PortfolioPeriod, string>> = {
  day: "日榜",
  week: "周榜",
  year: "年度榜",
};

type PortfolioDashboardProperties = Readonly<{
  initialState?: PortfolioDashboardState;
}>;

export function PortfolioDashboard({
  initialState = portfolioDashboardInitialState,
}: PortfolioDashboardProperties) {
  const [state, dispatch] = useReducer(portfolioDashboardReducer, initialState);
  const rankedPortfolios = syntheticPortfolios.toSorted(
    (left, right) => right.returns[state.period] - left.returns[state.period],
  );

  return (
    <div className={styles.pageStack}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>PORTFOLIO LAB · SYNTHETIC</p>
          <h2>组合实验室</h2>
          <p>用固定权重和固定收益序列，浏览组合观察的完整结构。</p>
        </div>
        <div className={styles.disclosures}>
          <strong>组合演示数据</strong>
          <span>无实盘资产 · 不构成投资建议</span>
        </div>
      </header>

      <section className={styles.portfolioSummary} aria-label="组合盈亏概况">
        <article>
          <span>演示组合总收益</span>
          <strong className={styles.up}>+18.42%</strong>
          <small>固定起点至今</small>
        </article>
        <article>
          <span>本周合成盈亏</span>
          <strong className={styles.up}>+3,640.00</strong>
          <small>CNY 等值 · 非真实资产</small>
        </article>
        <article>
          <span>观察组合</span>
          <strong>3</strong>
          <small>全部为 synthetic</small>
        </article>
      </section>

      <section
        className={styles.directionCard}
        aria-labelledby="direction-heading"
      >
        <div>
          <p className={styles.kicker}>COMPOSITE WIND VANE</p>
          <h3 id="direction-heading">组合风向</h3>
          <p>成长 56% · 防御 28% · 现金观察 16%</p>
        </div>
        <div
          aria-label="组合风向偏多 68 分"
          className={styles.directionGauge}
          role="img"
        >
          <strong>68</strong>
          <span>偏多</span>
        </div>
      </section>

      <section
        className={styles.panel}
        aria-labelledby="portfolio-ranking-heading"
      >
        <div className={styles.rankingHeading}>
          <div>
            <p className={styles.kicker}>FIXED RETURN RANKING</p>
            <h3 id="portfolio-ranking-heading">
              组合{periodLabels[state.period]}
            </h3>
          </div>
          <div className={styles.segmented} aria-label="组合榜单周期切换">
            {(
              [
                ["day", "日榜"],
                ["week", "周榜"],
                ["year", "年榜"],
              ] as const
            ).map(([period, label]) => (
              <button
                aria-pressed={state.period === period}
                key={period}
                onClick={() => dispatch({ type: "select-period", period })}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="visually-hidden">
          当前显示组合{periodLabels[state.period]}
        </p>
        <ol className={styles.portfolioList}>
          {rankedPortfolios.map((portfolio, index) => {
            const value = portfolio.returns[state.period];
            return (
              <li key={portfolio.portfolioId}>
                <span className={styles.rankNumber}>{index + 1}</span>
                <Link href={`/portfolios/${portfolio.portfolioId}`}>
                  <strong>{portfolio.name}</strong>
                  <small>
                    {portfolio.owner} · {portfolio.summary}
                  </small>
                </Link>
                <span>{portfolio.direction}</span>
                <strong className={value >= 0 ? styles.up : styles.down}>
                  {value >= 0 ? "+" : ""}
                  {value.toFixed(2)}%
                </strong>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className={styles.notice}>
        <strong>演示边界</strong>
        <p>
          所有组合、权重、盈亏和榜单均为固定合成数据，不连接账户，不提供交易能力。
        </p>
        <Link href="/markets">返回行情中心</Link>
      </aside>
    </div>
  );
}
