import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { CommunityFeed } from "../../../features/community/community-experience";
import type { CommunityChannel } from "../../../features/community/community-state";

/**
 * 社区频道的可深链入口。
 *
 * URL 用英文 slug 而不是中文频道名：中文在地址栏里会被百分号编码，
 * 复制分享时不可读。映射表是白名单，未知 slug 直接 404，
 * 不做模糊匹配。
 */
const channelBySlug: Readonly<Record<string, CommunityChannel>> = {
  etf: "ETF",
  follow: "关注",
  fund: "基金",
  hot: "热门",
  news: "资讯",
  talent: "达人",
};

export function generateStaticParams() {
  return Object.keys(channelBySlug).map((channel) => ({ channel }));
}

type CommunityChannelPageProperties = Readonly<{
  params: Promise<Readonly<{ channel: string }>>;
}>;

export async function generateMetadata({
  params,
}: CommunityChannelPageProperties): Promise<Metadata> {
  const { channel } = await params;
  const label = channelBySlug[channel];
  if (label === undefined) {
    return { title: "社区 · 火球" };
  }
  return {
    description: `社区「${label}」频道的观察记录`,
    title: `${label} · 社区 · 火球`,
  };
}

export default async function CommunityChannelPage({
  params,
}: CommunityChannelPageProperties) {
  const { channel } = await params;
  const initialChannel = channelBySlug[channel];
  if (initialChannel === undefined) {
    notFound();
  }

  return (
    <DesktopShell requiresD0Fixture={false}>
      <CommunityFeed initialChannel={initialChannel} />
    </DesktopShell>
  );
}
