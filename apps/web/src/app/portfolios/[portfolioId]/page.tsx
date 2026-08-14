import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { PortfolioFollowButton } from "../../../features/market-portfolio/portfolio-follow-button";
import { PortfolioHoldings } from "../../../features/market-portfolio/portfolio-holdings";
import styles from "../../../features/real-finance/instrument-section.module.css";
import { getPortfolio } from "../../../server/portfolio-store";
import { getAccount } from "../../../server/social-store";

/*
 * 组合详情。
 *
 * 这条路由此前有两套东西：真实组合走一段只有代码和权重的静态表格，
 * 样本组合（portfolio_syn_*）走另一套带编好收益曲线的页面，还配了一个
 * 点了会变文案、但什么都没保存的「+ 关注组合」按钮。
 *
 * 现在只剩一套：站内账号真实建过的组合。持仓配实时行情，关注按钮真正落盘。
 * 不存在的 id 就是 404——不是「暂未开放」。
 */

type PortfolioPageProperties = Readonly<{
  params: Promise<Readonly<{ portfolioId: string }>>;
}>;

export async function generateMetadata({
  params,
}: PortfolioPageProperties): Promise<Metadata> {
  const { portfolioId } = await params;
  const portfolio = getPortfolio(portfolioId);
  if (portfolio === null) return { title: "组合详情 · 火球" };
  return {
    description: portfolio.summary,
    title: `${portfolio.name} · 火球`,
  };
}

export default async function PortfolioPage({
  params,
}: PortfolioPageProperties) {
  const { portfolioId } = await params;
  const portfolio = getPortfolio(portfolioId);
  if (portfolio === null) notFound();

  const owner = getAccount(portfolio.ownerId);

  return (
    <DesktopShell>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          {portfolio.name}
          <small>创建于 {portfolio.createdAt.slice(0, 10)}</small>
        </h1>
        <p className={styles.prose}>
          {/*
            作者要能点开。榜单上写着谁建的，详情页却查无此人，
            那条信息就只是一个名字。
          */}
          {owner === null ? (
            "该组合的创建者账号已不存在。"
          ) : (
            <>
              由 <Link href={`/users/${owner.id}`}>{owner.displayName}</Link>{" "}
              创建
            </>
          )}
        </p>
        {portfolio.summary === "" ? null : (
          <p className={styles.prose}>{portfolio.summary}</p>
        )}

        <PortfolioFollowButton portfolioId={portfolio.id} />

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            持仓
            <span className={styles.count}>
              {portfolio.holdings.length.toString()} 只
            </span>
          </h2>
          <PortfolioHoldings holdings={portfolio.holdings} />
        </section>

        <p className={styles.disclosure}>
          这是一个记录用的组合：只保存标的与权重，不涉及真实资金、下单或持仓，
          也不构成投资建议。当日收益按权重对各标的当日涨跌幅加权得出，
          数据来自公开行情接口。
        </p>
      </div>
    </DesktopShell>
  );
}
