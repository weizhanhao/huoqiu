import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealFinanceBriefing } from "../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const model = await loadRuntimeFinancePublicViewModel({
    selectedRecordId: null,
  });

  return (
    <DesktopShell activeChannel="briefing">
      <RealFinanceBriefing model={model} />
    </DesktopShell>
  );
}
