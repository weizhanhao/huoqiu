import { DesktopShell } from "../../../components/shell/desktop-shell";
import { RealFinanceDetail } from "../../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

type NewsDetailPageProperties = Readonly<{
  params: Promise<Readonly<{ newsId: string }>>;
}>;

export default async function NewsDetailPage({
  params,
}: NewsDetailPageProperties) {
  const { newsId } = await params;
  const model = await loadRuntimeFinancePublicViewModel({
    selectedRecordId: newsId,
  });

  return (
    <DesktopShell activeChannel="news">
      <RealFinanceDetail model={model} />
    </DesktopShell>
  );
}
