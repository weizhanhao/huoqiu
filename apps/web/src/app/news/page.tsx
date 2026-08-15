import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealFinanceHub } from "../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "来自真实公开来源的财经记录，可追溯到原始出处",
  title: "资讯 · 火球",
};

type NewsPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{
      channel?: string | readonly string[] | undefined;
      q?: string | readonly string[] | undefined;
    }>
  >;
}>;

export default async function NewsPage({ searchParams }: NewsPageProperties) {
  await searchParams;
  const model = await loadRuntimeFinancePublicViewModel({
    selectedRecordId: null,
  });

  return (
    <DesktopShell>
      <RealFinanceHub model={model} />
    </DesktopShell>
  );
}
