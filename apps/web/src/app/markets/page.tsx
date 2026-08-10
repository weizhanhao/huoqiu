import { DesktopShell } from "../../components/shell/desktop-shell";
import { MarketDashboard } from "../../features/market-portfolio/market-dashboard";

export default function MarketsPage() {
  return (
    <DesktopShell>
      <MarketDashboard />
    </DesktopShell>
  );
}
