import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { RealFundDetail } from "../../../features/fund-center/real-fund-detail";
import { loadFund } from "../../../server/fund.server";

/*
 * 基金详情。
 *
 * 这条路由此前有两套东西：六位数字代码走真实基金，`fund_syn_000x` 走另一套
 * 编好的样本基金——净值、持仓、公告全是假的。基金列表现在只列真实基金，
 * 那六只样本已经没有任何入口，留着就是六个凭地址才能打开的假页面。
 *
 * 现在只剩真实基金。取不到就是 404，不是「详情暂未开放」——
 * 后者会让人以为这只基金站里有，只是还没做完。
 */

type FundDetailPageProperties = Readonly<{
  params: Promise<{ fundId: string }>;
}>;

export async function generateMetadata({
  params,
}: FundDetailPageProperties): Promise<Metadata> {
  const { fundId } = await params;

  // 这一步顺带预热缓存，紧接着的渲染直接复用。
  const fund = await loadFund(fundId);
  if (fund === null) return { title: "基金详情 · 火球" };

  return {
    description: `${fund.name ?? fundId}（${fund.code}）的净值走势与基金概况`,
    title: `${fund.name ?? fundId} ${fund.code} · 火球`,
  };
}

export default async function FundDetailPage({
  params,
}: FundDetailPageProperties) {
  const { fundId } = await params;

  /*
   * 不预生成静态参数：真实公募有上万只，全量预生成既构建不完也没有意义。
   * 这条路由按需渲染。
   */
  const fund = await loadFund(fundId);
  if (fund === null) notFound();

  return (
    <DesktopShell activeChannel="funds">
      <RealFundDetail fund={fund} />
    </DesktopShell>
  );
}
