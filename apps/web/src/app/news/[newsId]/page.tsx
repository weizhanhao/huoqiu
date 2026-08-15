import type { Metadata } from "next";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { RealFinanceDetail } from "../../../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../../../features/real-finance/finance-snapshot.server";

export const dynamic = "force-dynamic";

/*
 * 标题不带具体记录名：这条路由的内容来自运行时快照，快照可能缺失或被
 * 轮转，用一个查不到就会失真的标题不如用稳定的分区名。
 */
export const metadata: Metadata = {
  description: "单条公开来源记录的完整元数据与原始出处链接",
  title: "资讯详情 · 火球",
};

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
    <DesktopShell>
      <RealFinanceDetail model={model} />
    </DesktopShell>
  );
}
