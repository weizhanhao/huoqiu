import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealFinanceBriefing } from "../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "官方申报与公开来源记录，按绝对时间排序",
  title: "7×24 · 火球",
};

export default async function BriefingPage() {
  const model = await loadRuntimeFinancePublicViewModel({
    selectedRecordId: null,
  });

  return (
    <DesktopShell>
      <RealFinanceBriefing model={model} />
    </DesktopShell>
  );
}
