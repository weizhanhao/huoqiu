import { DesktopShell } from "../../components/shell/desktop-shell";
import { FinanceBriefingTimeline } from "../../features/finance-information/finance-briefing-timeline";

export default function BriefingPage() {
  return (
    <DesktopShell activeChannel="briefing">
      <FinanceBriefingTimeline />
    </DesktopShell>
  );
}
