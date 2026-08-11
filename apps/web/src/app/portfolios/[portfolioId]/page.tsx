import { DesktopShell } from "../../../components/shell/desktop-shell";
import { PageState } from "../../../components/system/page-state";
import { PortfolioDetail } from "../../../features/market-portfolio/portfolio-detail";
import { syntheticPortfolios } from "../../../features/market-portfolio/synthetic-data";

type PortfolioPageProperties = Readonly<{
  params: Promise<Readonly<{ portfolioId: string }>>;
}>;

export const generateStaticParams = () =>
  syntheticPortfolios.map((portfolio) => ({
    portfolioId: portfolio.portfolioId,
  }));

export default async function PortfolioPage({
  params,
}: PortfolioPageProperties) {
  const { portfolioId } = await params;

  return (
    <DesktopShell activePrimary="portfolios">
      {portfolioId === "portfolio_syn_0001" ? (
        <PortfolioDetail />
      ) : (
        <PageState state="empty" emptyMessage="该演示组合详情暂未开放" />
      )}
    </DesktopShell>
  );
}
