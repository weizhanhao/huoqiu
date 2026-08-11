import { DesktopShell } from "../../components/shell/desktop-shell";
import { PortfolioDashboard } from "../../features/market-portfolio/portfolio-dashboard";

export default function PortfoliosPage() {
  return (
    <DesktopShell activePrimary="portfolios">
      <PortfolioDashboard />
    </DesktopShell>
  );
}
