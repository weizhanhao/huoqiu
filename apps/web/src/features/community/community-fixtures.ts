import type { CommunityChannel } from "./community-state";

export type FeedCardKind = "帖子" | "资讯" | "话题" | "视频占位";

export type FeedCard = Readonly<{
  author: string;
  body: string;
  channel: CommunityChannel;
  id: string;
  kind: FeedCardKind;
  meta: string;
  title: string;
}>;

export const communityFeedCards: readonly FeedCard[] = [
  {
    author: "北岸观察员",
    body: "把本周的公开数据按经营、估值、情绪三个维度拆开记录，避免单一叙事盖过事实。",
    channel: "关注",
    id: "post_syn_0001",
    kind: "帖子",
    meta: "今天 10:05 · 128 赞 · 32 评论",
    title: "一份关于长期观察节奏的合成笔记",
  },
  {
    author: "市场资料室",
    body: "这是一条固定合成资讯卡，用于展示信息来源、时间与摘要的阅读密度。",
    channel: "资讯",
    id: "news_syn_0001",
    kind: "资讯",
    meta: "今天 09:30 · 合成资料",
    title: "公开市场周度观察：样本行业的三个变化",
  },
  {
    author: "研究练习社",
    body: "用一个问题展开讨论：如何为一条观点补足可验证的反例？",
    channel: "热门",
    id: "topic_syn_0001",
    kind: "话题",
    meta: "2,408 人参与 · 仅演示",
    title: "# 研究中的反证清单 #",
  },
  {
    author: "指数散步者",
    body: "一段无真实视频的版位，说明短视频内容的时间、主题和观看入口在信息流中的呈现方式。",
    channel: "ETF",
    id: "video_syn_0001",
    kind: "视频占位",
    meta: "03:18 · 356 次模拟观看",
    title: "ETF 观察框架：从样本到笔记",
  },
  {
    author: "基金学习簿",
    body: "合成基金卡保留了作者、主题与讨论线索，所有数据仅用于界面演示。",
    channel: "基金",
    id: "fund_syn_0001",
    kind: "帖子",
    meta: "昨天 16:40 · 合成讨论",
    title: "用回撤语言复盘一份模拟组合",
  },
  {
    author: "成长样本库",
    body: "达人频道展示固定的观察笔记，不连接真实人物或外部内容源。",
    channel: "达人",
    id: "expert_syn_0001",
    kind: "帖子",
    meta: "昨天 14:20 · 固定合成内容",
    title: "给研究过程留下一条可回看的证据链",
  },
];

export const postDetail = {
  author: "合成作者 · 北岸观察员",
  body: [
    "这是一份完全虚构的社区观察笔记。我们用同一组固定样本反复练习：先描述数据，再写判断，最后补一个可能推翻判断的条件。",
    "任何数字、名称和情节都不指向真实投资对象；它们只用于演示帖子详情、互动与评论的阅读结构。",
  ],
  relatedInstruments: ["样本科技 SYN-A", "合成指数 SYN-50", "演示基金 DEMO-F"],
  time: "今天 10:05 · 合成社区",
  title: "一份关于长期观察节奏的合成笔记",
} as const;
