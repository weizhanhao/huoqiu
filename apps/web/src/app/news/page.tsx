import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealFinanceHub } from "../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

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
    <DesktopShell activeChannel="news">
      <RealFinanceHub model={model} />
    </DesktopShell>
  );
}
