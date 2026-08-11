import { DesktopShell } from "../../../components/shell/desktop-shell";
import { PageState } from "../../../components/system/page-state";
import { FinanceInformationDetail } from "../../../features/finance-information/finance-information-detail";
import {
  financeInformationItems,
  getFinanceInformationById,
} from "../../../features/finance-information/finance-information-fixtures";

type NewsDetailPageProperties = Readonly<{
  params: Promise<Readonly<{ newsId: string }>>;
}>;

export const generateStaticParams = () =>
  financeInformationItems.map((item) => ({ newsId: item.id }));

export default async function NewsDetailPage({
  params,
}: NewsDetailPageProperties) {
  const { newsId } = await params;
  const item = getFinanceInformationById(newsId);

  return (
    <DesktopShell activeChannel="news">
      {item === undefined ? (
        <PageState state="empty" emptyMessage="没有这条合成资讯" />
      ) : (
        <FinanceInformationDetail item={item} />
      )}
    </DesktopShell>
  );
}
