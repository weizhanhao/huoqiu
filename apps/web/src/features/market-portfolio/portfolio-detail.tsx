"use client";

import Link from "next/link";
import { useReducer } from "react";

import styles from "./market-portfolio.module.css";
import {
  portfolioCurve,
  portfolioHoldings,
  rebalanceHistory,
  syntheticPortfolios,
} from "./synthetic-data";

export type PortfolioFollowAction = Readonly<{ type: "toggle-follow" }>;

export const portfolioFollowReducer = (
  followed: boolean,
  action: PortfolioFollowAction,
): boolean => (action.type === "toggle-follow" ? !followed : followed);

type PortfolioDetailProperties = Readonly<{
  initialFollowed?: boolean;
}>;

export function PortfolioDetail({
  initialFollowed = false,
}: PortfolioDetailProperties) {
  const [followed, dispatch] = useReducer(
    portfolioFollowReducer,
    initialFollowed,
  );
  const portfolio = syntheticPortfolios[0];
  const curvePoints = portfolioCurve
    .map((value, index) => {
      const x = (index / (portfolioCurve.length - 1)) * 100;
      const y = 42 - ((value - 98) / 22) * 34;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className={styles.pageStack}>
      <header className={styles.portfolioHero}>
        <div>
          <Link className={styles.backLink} href="/portfolios">
            ← 组合实验室
          </Link>
          <p className={styles.kicker}>PORTFOLIO_SYN_0001</p>
          <h2>{portfolio.name}</h2>
          <p>
            {portfolio.owner} · {portfolio.summary}
          </p>
        </div>
        <button
          aria-pressed={followed}
          className={styles.followButton}
          onClick={() => dispatch({ type: "toggle-follow" })}
          type="button"
        >
          {followed ? "已关注组合" : "+ 关注组合"}
        </button>
      </header>

      <div className={styles.disclosureBar} role="note">
        <strong>固定合成数据</strong>
        <span>无真实资金、账户或交易能力 · 不构成投资建议</span>
      </div>

      <section className={styles.portfolioSummary} aria-label="组合收益概览">
        <article>
          <span>累计收益</span>
          <strong className={styles.up}>+18.42%</strong>
          <small>自合成起点</small>
        </article>
        <article>
          <span>今日收益</span>
          <strong className={styles.up}>+1.28%</strong>
          <small>固定快照</small>
        </article>
        <article>
          <span>最大合成回撤</span>
          <strong className={styles.down}>-4.60%</strong>
          <small>演示区间</small>
        </article>
        <article>
          <span>组合风向</span>
          <strong>偏多 68</strong>
          <small>固定指标</small>
        </article>
      </section>

      <section className={styles.panel} aria-labelledby="curve-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>NORMALIZED · BASE 100</p>
            <h3 id="curve-heading">组合收益曲线</h3>
          </div>
          <strong className={styles.up}>100 → 118.42</strong>
        </div>
        <svg
          aria-labelledby="curve-title curve-description"
          className={styles.portfolioCurve}
          role="img"
          viewBox="0 0 100 48"
        >
          <title id="curve-title">稳健火种组合固定合成收益曲线</title>
          <desc id="curve-description">
            曲线从基准 100 波动上升至 118.42，仅用于界面演示。
          </desc>
          <line x1="0" x2="100" y1="42" y2="42" />
          <line x1="0" x2="100" y1="24" y2="24" />
          <line x1="0" x2="100" y1="7" y2="7" />
          <polyline points={curvePoints} />
        </svg>
      </section>

      <div className={styles.detailColumns}>
        <section className={styles.panel} aria-labelledby="holdings-heading">
          <div className={styles.sectionHeading}>
            <h3 id="holdings-heading">持仓明细</h3>
            <span>合计 100%</span>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th scope="col">合成标的</th>
                  <th scope="col">权重</th>
                  <th scope="col">持仓收益</th>
                </tr>
              </thead>
              <tbody>
                {portfolioHoldings.map((holding) => (
                  <tr key={holding.listingId}>
                    <th scope="row">
                      <Link href={`/instruments/${holding.listingId}`}>
                        <strong>{holding.name}</strong>
                        <small>{holding.symbol} · synthetic</small>
                      </Link>
                    </th>
                    <td>{holding.weight}%</td>
                    <td
                      className={
                        holding.returnPct >= 0 ? styles.up : styles.down
                      }
                    >
                      {holding.returnPct >= 0 ? "+" : ""}
                      {holding.returnPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="rebalance-heading">
          <div className={styles.sectionHeading}>
            <h3 id="rebalance-heading">调仓记录</h3>
            <span>固定时间线</span>
          </div>
          <ol className={styles.timeline}>
            {rebalanceHistory.map((record) => (
              <li key={`${record.date}-${record.action}`}>
                <time dateTime={record.date}>{record.date}</time>
                <div>
                  <strong>{record.action}</strong>
                  <p>{record.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
