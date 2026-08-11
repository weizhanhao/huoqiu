import type { CommunityChannel } from "./community-state";

export const syntheticCommunitySource = "huoqiu-synthetic-community" as const;

export type FeedCardKind =
  "帖子" | "资讯" | "话题" | "长文摘要" | "图文占位" | "视频占位";

export type CommunityAuthor = Readonly<{
  bio: string;
  displayName: string;
  focus: readonly string[];
  followers: number;
  id: string;
  initials: string;
  notes: number;
  role: string;
  synthetic: true;
}>;

export type CommunityEngagement = Readonly<{
  comments: number;
  likes: number;
  reposts: number;
  views: number;
}>;

export type CommunityMedia = Readonly<{
  alt: string;
  duration?: string;
  label: string;
  type: "chart-placeholder" | "image-placeholder" | "video-placeholder";
}>;

export type FeedCard = Readonly<{
  author: string;
  authorId: string;
  body: string;
  channel: CommunityChannel;
  detailHref?: string;
  engagement: CommunityEngagement;
  id: string;
  kind: FeedCardKind;
  media?: CommunityMedia;
  meta: string;
  publishedLabel: string;
  readTime?: string;
  source: typeof syntheticCommunitySource;
  synthetic: true;
  tags: readonly string[];
  title: string;
}>;

export const createSyntheticCommunityCard = (
  input: Omit<FeedCard, "source" | "synthetic">,
): FeedCard => ({
  ...input,
  source: syntheticCommunitySource,
  synthetic: true,
});

export const formatCommunityCount = (count: number): string =>
  new Intl.NumberFormat("zh-CN").format(count);
