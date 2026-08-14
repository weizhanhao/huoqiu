import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { PrivateFundsHub } from "../../features/channels/private-funds-hub";

export const metadata: Metadata = {
  description: "私募管理人与策略样本清单",
  title: "私募 · 火球",
};

export default function PrivateFundsPage() {
  return (
    <DesktopShell activeChannel="privateFunds" requiresD0Fixture={false}>
      <PrivateFundsHub />
    </DesktopShell>
  );
}
