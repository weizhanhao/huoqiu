import type { CommunityChannel } from "./community-state";
import {
  createSyntheticCommunityCard as card,
  type FeedCard,
} from "./community-content-model";
import {
  longformPostBodies,
  relatedInstrumentsByPost,
  type RelatedInstrument,
} from "./community-longform";

export {
  communityAuthors,
  getCommunityAuthor,
} from "./community-author-fixtures";
export {
  syntheticCommunitySource,
  type CommunityAuthor,
  type CommunityEngagement,
  type CommunityMedia,
  type FeedCard,
  type FeedCardKind,
} from "./community-content-model";

export const communityFeedCards: readonly FeedCard[] = [
  card({
    author: "北岸观察员",
    authorId: "author_syn_northbank",
    body: "把一条观察拆成事实、判断和待验证条件，再补上可能推翻判断的反例。这个模板只使用虚构样本。",
    channel: "关注",
    detailHref: "/community/posts/post_syn_0001",
    engagement: { comments: 32, likes: 128, reposts: 18, views: 4820 },
    id: "post_syn_0001",
    kind: "帖子",
    meta: "今天 10:05 · 128 赞 · 32 评论",
    publishedLabel: "今天 10:05",
    tags: ["复盘方法", "笔记"],
    title: "一份关于长期观察节奏的笔记",
  }),
  card({
    author: "慢变量笔记",
    authorId: "author_syn_slow",
    body: "先记下当时能看到的信息，再写选择理由。回看时只问判断链是否完整，不用结果倒推过程。",
    channel: "关注",
    engagement: { comments: 46, likes: 276, reposts: 39, views: 8350 },
    id: "post_syn_decision_log",
    kind: "长文摘要",
    meta: "今天 09:42 · 6 分钟阅读",
    publishedLabel: "今天 09:42",
    readTime: "6 分钟阅读",
    tags: ["决策日志", "复盘"],
    title: "长文摘要：如何让一份决策日志经得起回看",
  }),
  card({
    author: "离线影像间",
    authorId: "author_syn_media",
    body: "三张纯 CSS 占位卡分别代表原始记录、核对清单和结论草稿，用于演示图文信息流。",
    channel: "关注",
    engagement: { comments: 19, likes: 164, reposts: 11, views: 3910 },
    id: "media_syn_research_desk",
    kind: "图文占位",
    media: {
      alt: "三张本地研究卡片占位图",
      label: "3 张本地占位图 · 无外部素材",
      type: "image-placeholder",
    },
    meta: "今天 08:56 · 本地媒体占位",
    publishedLabel: "今天 08:56",
    tags: ["图文演示", "离线素材"],
    title: "把研究桌面整理成三层证据卡",
  }),
  card({
    author: "问题清单",
    authorId: "author_syn_questions",
    body: "好问题要能明确时间范围、信息来源和失败条件。评论区整理了五种更容易得到有效回答的问法。",
    channel: "关注",
    engagement: { comments: 74, likes: 318, reposts: 56, views: 10620 },
    id: "post_syn_better_questions",
    kind: "帖子",
    meta: "昨天 22:18 · 74 条讨论",
    publishedLabel: "昨天 22:18",
    tags: ["提问方式", "社区讨论"],
    title: "把“怎么看”改写成一个可以讨论的问题",
  }),
  card({
    author: "成长样本库",
    authorId: "author_syn_growth",
    body: "每周只更新发生变化的假设，并保留上一版原因。这里展示的是虚构样本的长文摘要结构。",
    channel: "关注",
    engagement: { comments: 28, likes: 241, reposts: 31, views: 6740 },
    id: "article_syn_weekly_archive",
    kind: "长文摘要",
    meta: "昨天 20:40 · 8 分钟阅读",
    publishedLabel: "昨天 20:40",
    readTime: "8 分钟阅读",
    tags: ["样本归档", "长文"],
    title: "长文摘要：给长期观察建立可追溯的版本线",
  }),

  card({
    author: "研究练习社",
    authorId: "author_syn_lab",
    body: "用一个问题展开讨论：怎样为自己的观点主动补足最有力的反例？",
    channel: "热门",
    engagement: { comments: 186, likes: 520, reposts: 83, views: 24_080 },
    id: "topic_syn_0001",
    kind: "话题",
    meta: "2,408 人参与 · 话题",
    publishedLabel: "今天 11:08",
    tags: ["热门讨论", "反证"],
    title: "# 研究中的反证清单 #",
  }),
  card({
    author: "慢变量笔记",
    authorId: "author_syn_slow",
    body: "把最近一次判断拆成输入、假设、行动和复盘四栏，欢迎只讨论方法，不代入任何真实标的。",
    channel: "热门",
    engagement: { comments: 112, likes: 604, reposts: 92, views: 31_400 },
    id: "post_syn_four_column_review",
    kind: "帖子",
    meta: "今天 10:36 · 热门讨论",
    publishedLabel: "今天 10:36",
    tags: ["四栏复盘", "方法讨论"],
    title: "我把一次错误判断写成了四栏复盘",
  }),
  card({
    author: "离线影像间",
    authorId: "author_syn_media",
    body: "圆桌视频为本地渐变占位，不包含真实人物、声音或外部视频文件。",
    channel: "热门",
    engagement: { comments: 68, likes: 390, reposts: 44, views: 18_620 },
    id: "video_syn_roundtable",
    kind: "视频占位",
    media: {
      alt: "研究圆桌视频封面占位",
      duration: "05:42",
      label: "本地视频封面占位 · 无真实媒体",
      type: "video-placeholder",
    },
    meta: "今天 09:15 · 05:42",
    publishedLabel: "今天 09:15",
    tags: ["圆桌占位", "研究习惯"],
    title: "圆桌：哪些笔记值得长期保留",
  }),
  card({
    author: "问题清单",
    authorId: "author_syn_questions",
    body: "讨论前先写清楚哪些信息缺失，可以明显减少评论区里互相猜测的成本。",
    channel: "热门",
    engagement: { comments: 91, likes: 448, reposts: 67, views: 20_930 },
    id: "post_syn_missing_context",
    kind: "帖子",
    meta: "昨天 23:12 · 91 条讨论",
    publishedLabel: "昨天 23:12",
    tags: ["讨论质量", "上下文"],
    title: "高质量讨论往往从承认信息不足开始",
  }),
  card({
    author: "北岸观察员",
    authorId: "author_syn_northbank",
    body: "这份清单只描述阅读与记录流程：先看原始材料，再看解释，最后写自己的不确定项。",
    channel: "热门",
    engagement: { comments: 57, likes: 356, reposts: 48, views: 14_700 },
    id: "article_syn_reading_order",
    kind: "长文摘要",
    meta: "昨天 21:05 · 7 分钟阅读",
    publishedLabel: "昨天 21:05",
    readTime: "7 分钟阅读",
    tags: ["阅读顺序", "信息整理"],
    title: "长文摘要：一份减少叙事干扰的阅读顺序",
  }),

  card({
    author: "火球演示编辑部",
    authorId: "author_syn_editorial",
    body: "本频道只展示社区产品说明与资料卡，不包含真实财经新闻、行情、公告或宏观数据。",
    channel: "资讯",
    engagement: { comments: 8, likes: 72, reposts: 6, views: 1240 },
    id: "news_syn_0001",
    kind: "资讯",
    meta: "今天 09:30 · 产品资料",
    publishedLabel: "今天 09:30",
    tags: ["内容标识", "产品说明"],
    title: "社区内容与真实财经信息如何区分",
  }),
  card({
    author: "市场资料室",
    authorId: "author_syn_archive",
    body: "资料卡建议保留来源、发布时间、抓取时间和授权状态；本卡仅演示字段，不指向外部来源。",
    channel: "资讯",
    engagement: { comments: 17, likes: 94, reposts: 14, views: 2380 },
    id: "notice_syn_source_fields",
    kind: "资讯",
    meta: "今天 08:40 · 资料卡",
    publishedLabel: "今天 08:40",
    tags: ["来源字段", "资料规范"],
    title: "一张可追溯内容卡应该保留哪些字段",
  }),
  card({
    author: "火球演示编辑部",
    authorId: "author_syn_editorial",
    body: "新增更密集的用户帖子、长文摘要、评论回复和本地媒体占位，所有互动刷新后重置。",
    channel: "资讯",
    engagement: { comments: 12, likes: 86, reposts: 9, views: 1920 },
    id: "news_syn_density_release",
    kind: "资讯",
    meta: "昨天 18:00 · 功能说明",
    publishedLabel: "昨天 18:00",
    tags: ["版本说明", "社区密度"],
    title: "本次更新：社区信息流内容更加完整",
  }),
  card({
    author: "市场资料室",
    authorId: "author_syn_archive",
    body: "把“待核验”“已核验”和“仅供界面演示”分开呈现，读者更容易判断一条内容能否使用。",
    channel: "资讯",
    engagement: { comments: 24, likes: 138, reposts: 21, views: 3460 },
    id: "notice_syn_content_states",
    kind: "长文摘要",
    meta: "昨天 15:24 · 4 分钟阅读",
    publishedLabel: "昨天 15:24",
    readTime: "4 分钟阅读",
    tags: ["内容状态", "阅读提示"],
    title: "长文摘要：让内容状态比颜色更清楚",
  }),
  card({
    author: "离线影像间",
    authorId: "author_syn_media",
    body: "信息来源流程图为纯 CSS 占位，用于测试图文卡在不同屏幕下的阅读节奏。",
    channel: "资讯",
    engagement: { comments: 10, likes: 81, reposts: 8, views: 1740 },
    id: "media_syn_source_flow",
    kind: "图文占位",
    media: {
      alt: "内容来源流程图占位",
      label: "流程图占位 · 纯本地渲染",
      type: "chart-placeholder",
    },
    meta: "前天 20:10 · 本地媒体占位",
    publishedLabel: "前天 20:10",
    tags: ["流程图", "来源说明"],
    title: "从内容采集到页面展示的状态示意",
  }),

  card({
    author: "成长样本库",
    authorId: "author_syn_growth",
    body: "达人频道展示栏目作者的观察笔记和资料，不连接真实人物或外部社交图谱。",
    channel: "达人",
    engagement: { comments: 38, likes: 304, reposts: 42, views: 9280 },
    id: "expert_syn_0001",
    kind: "帖子",
    meta: "昨天 14:20 · 栏目记录",
    publishedLabel: "昨天 14:20",
    tags: ["证据链", "达人样本"],
    title: "给研究过程留下一条可回看的证据链",
  }),
  card({
    author: "北岸观察员",
    authorId: "author_syn_northbank",
    body: "我把每周复盘限制在三页：变化、未变化和需要继续等待的证据。模板使用虚构案例。",
    channel: "达人",
    engagement: { comments: 52, likes: 418, reposts: 71, views: 13_460 },
    id: "expert_syn_three_pages",
    kind: "长文摘要",
    meta: "昨天 11:36 · 9 分钟阅读",
    publishedLabel: "昨天 11:36",
    readTime: "9 分钟阅读",
    tags: ["周度复盘", "作者方法"],
    title: "长文摘要：为什么我的周度复盘只有三页",
  }),
  card({
    author: "慢变量笔记",
    authorId: "author_syn_slow",
    body: "不急着给每条信息下结论，先记录它改变了哪个假设，以及哪些假设仍未受影响。",
    channel: "达人",
    engagement: { comments: 41, likes: 362, reposts: 55, views: 10_840 },
    id: "expert_syn_hypothesis_map",
    kind: "帖子",
    meta: "前天 21:18 · 专栏",
    publishedLabel: "前天 21:18",
    tags: ["假设地图", "慢变量"],
    title: "先更新假设地图，再更新结论",
  }),
  card({
    author: "问题清单",
    authorId: "author_syn_questions",
    body: "本期问答只聊如何说明不确定性，媒体区域为无真实人物的本地封面占位。",
    channel: "达人",
    engagement: { comments: 87, likes: 506, reposts: 64, views: 21_300 },
    id: "video_syn_expert_qa",
    kind: "视频占位",
    media: {
      alt: "作者问答视频封面占位",
      duration: "07:16",
      label: "问答封面占位 · 无真实人物",
      type: "video-placeholder",
    },
    meta: "前天 19:30 · 07:16",
    publishedLabel: "前天 19:30",
    tags: ["作者问答", "不确定性"],
    title: "作者问答：怎样把“不知道”写清楚",
  }),
  card({
    author: "研究练习社",
    authorId: "author_syn_lab",
    body: "把高赞回答改写成一份可执行练习：陈述事实、指出缺口、给出下一步验证动作。",
    channel: "达人",
    engagement: { comments: 63, likes: 441, reposts: 78, views: 16_700 },
    id: "expert_syn_answer_workshop",
    kind: "话题",
    meta: "08-09 16:40 · 工作坊",
    publishedLabel: "08-09 16:40",
    tags: ["回答练习", "达人方法"],
    title: "# 把一条回答改写成可验证的练习 #",
  }),

  card({
    author: "基金学习簿",
    authorId: "author_syn_fund",
    body: "这张卡只演示如何用风险语言记录虚构组合，不包含真实基金、净值或申购信息。",
    channel: "基金",
    engagement: { comments: 36, likes: 210, reposts: 22, views: 5920 },
    id: "fund_syn_0001",
    kind: "帖子",
    meta: "昨天 16:40 · 讨论",
    publishedLabel: "昨天 16:40",
    tags: ["风险语言", "基金学习"],
    title: "用回撤语言复盘一份模拟组合",
  }),
  card({
    author: "基金学习簿",
    authorId: "author_syn_fund",
    body: "学习卡只保留目标、期限、可承受波动和退出条件，避免用产品名称替代真实需求。",
    channel: "基金",
    engagement: { comments: 43, likes: 264, reposts: 31, views: 7180 },
    id: "fund_syn_need_card",
    kind: "长文摘要",
    meta: "昨天 13:28 · 5 分钟阅读",
    publishedLabel: "昨天 13:28",
    readTime: "5 分钟阅读",
    tags: ["需求卡", "学习框架"],
    title: "长文摘要：先写需求卡，再看虚构产品样本",
  }),
  card({
    author: "研究练习社",
    authorId: "author_syn_lab",
    body: "讨论只围绕分类方法：风格、期限和风险来源应该怎样分别记录。",
    channel: "基金",
    engagement: { comments: 79, likes: 332, reposts: 47, views: 9860 },
    id: "fund_syn_classification_topic",
    kind: "话题",
    meta: "前天 22:06 · 79 条讨论",
    publishedLabel: "前天 22:06",
    tags: ["分类练习", "风险来源"],
    title: "# 一份基金学习笔记应该先分哪几类 #",
  }),
  card({
    author: "离线影像间",
    authorId: "author_syn_media",
    body: "四象限图为纯本地占位，只演示学习卡片的视觉组织，不承载真实基金数据。",
    channel: "基金",
    engagement: { comments: 21, likes: 176, reposts: 16, views: 4380 },
    id: "fund_syn_quadrant_media",
    kind: "图文占位",
    media: {
      alt: "基金学习四象限占位图",
      label: "四象限占位 · 无真实基金数据",
      type: "chart-placeholder",
    },
    meta: "08-09 18:12 · 本地图表占位",
    publishedLabel: "08-09 18:12",
    tags: ["四象限", "图文演示"],
    title: "把风险来源整理成一张学习四象限",
  }),
  card({
    author: "慢变量笔记",
    authorId: "author_syn_slow",
    body: "复盘时分别记录策略是否改变、执行是否偏离和假设是否失效，内容不涉及任何真实产品。",
    channel: "基金",
    engagement: { comments: 34, likes: 228, reposts: 25, views: 6120 },
    id: "fund_syn_review_layers",
    kind: "帖子",
    meta: "08-09 15:46 · 学习笔记",
    publishedLabel: "08-09 15:46",
    tags: ["分层复盘", "过程记录"],
    title: "把模拟组合复盘拆成策略、执行和假设三层",
  }),

  card({
    author: "指数散步者",
    authorId: "author_syn_index",
    body: "一段无真实视频的版位，演示短视频的时长、主题和观看入口在信息流中的呈现方式。",
    channel: "ETF",
    engagement: { comments: 26, likes: 188, reposts: 23, views: 7350 },
    id: "video_syn_0001",
    kind: "视频占位",
    media: {
      alt: "ETF 观察框架视频封面占位",
      duration: "03:18",
      label: "视频封面占位 · 无真实产品与行情",
      type: "video-placeholder",
    },
    meta: "03:18 · 356 次模拟观看",
    publishedLabel: "今天 08:18",
    tags: ["视频占位", "观察框架"],
    title: "ETF 观察框架：从虚构样本到学习笔记",
  }),
  card({
    author: "指数散步者",
    authorId: "author_syn_index",
    body: "先写清楚虚构样本代表什么、不代表什么，再讨论分类是否合理，避免标签代替研究。",
    channel: "ETF",
    engagement: { comments: 55, likes: 297, reposts: 44, views: 8950 },
    id: "etf_syn_label_limits",
    kind: "长文摘要",
    meta: "昨天 19:42 · 6 分钟阅读",
    publishedLabel: "昨天 19:42",
    readTime: "6 分钟阅读",
    tags: ["标签边界", "样本分类"],
    title: "长文摘要：一个分类标签不能替代哪些问题",
  }),
  card({
    author: "研究练习社",
    authorId: "author_syn_lab",
    body: "用固定虚构样本讨论分类重叠：同一条记录可以同时属于哪些观察主题？",
    channel: "ETF",
    engagement: { comments: 104, likes: 376, reposts: 51, views: 12_400 },
    id: "etf_syn_overlap_topic",
    kind: "话题",
    meta: "昨天 17:08 · 104 条讨论",
    publishedLabel: "昨天 17:08",
    tags: ["分类重叠", "讨论练习"],
    title: "# 当虚构样本同时属于多个主题时怎么记 #",
  }),
  card({
    author: "离线影像间",
    authorId: "author_syn_media",
    body: "关系图为纯 CSS 占位，只用于演示信息架构，不包含真实指数、ETF 或成分数据。",
    channel: "ETF",
    engagement: { comments: 17, likes: 142, reposts: 13, views: 3520 },
    id: "etf_syn_map_media",
    kind: "图文占位",
    media: {
      alt: "指数与 ETF 关系图占位",
      label: "关系图占位 · 无真实成分数据",
      type: "chart-placeholder",
    },
    meta: "前天 15:30 · 本地图表占位",
    publishedLabel: "前天 15:30",
    tags: ["关系图", "离线占位"],
    title: "把虚构指数、主题和观察卡连成一张关系图",
  }),
  card({
    author: "问题清单",
    authorId: "author_syn_questions",
    body: "提问卡聚焦学习目标、风险边界和验证方法，不比较或推荐任何真实产品。",
    channel: "ETF",
    engagement: { comments: 62, likes: 256, reposts: 36, views: 7680 },
    id: "etf_syn_question_card",
    kind: "帖子",
    meta: "08-09 20:08 · 提问卡",
    publishedLabel: "08-09 20:08",
    tags: ["提问卡", "风险边界"],
    title: "看虚构 ETF 样本前，我会先回答这五个问题",
  }),
];

export const getCommunityFeedCards = (
  channel?: CommunityChannel,
): readonly FeedCard[] =>
  channel === undefined
    ? communityFeedCards
    : communityFeedCards.filter((item) => item.channel === channel);

/*
 * 帖子详情视图。
 *
 * 过去只有 post_syn_0001 一条有详情页，其余 29 条在卡片底部显示死文本
 * 「固定内容」——点不动。现在每条帖子都有自己的永久链接：详情内容
 * 由该帖自己的记录组成，没有的字段就不渲染那一块，绝不拿别人的内容顶替。
 */
export type PostDetailView = Readonly<{
  author: string;
  authorId: string;
  baselineCommentTotal: number;
  body: readonly string[];
  /*
   * 正文里 @ 与 # 的解析依据。
   *
   * 在这里传进来，而不是让渲染层自己去查：渲染层是客户端组件，账号表和
   * 话题表都在服务端。而且「谁能被链到」必须由服务端说了算。
   */
  bodyContext?: Readonly<{
    accounts: readonly Readonly<{ displayName: string; id: string }>[];
    topics: readonly string[];
  }>;
  /** 作者主动加的创作声明。没加就没有这一项。 */
  disclosure?: "ai";
  /** 该帖自己的互动数据。过去详情页对 30 篇帖子显示同一组写死的数字。 */
  engagement: Readonly<{
    bookmarks: number;
    reposts: number;
    views: number;
  }>;
  id: string;
  relatedInstruments: readonly RelatedInstrument[];
  tags: readonly string[];
  time: string;
  title: string;
}>;

export const getPostDetailView = (postId: string): PostDetailView | null => {
  const card = communityFeedCards.find((entry) => entry.id === postId);
  if (card === undefined) {
    return null;
  }

  return {
    author: card.author,
    authorId: card.authorId,
    baselineCommentTotal: card.engagement.comments,
    body: longformPostBodies[postId] ?? [card.body],
    engagement: {
      // 收藏没有单独统计，用转发的一半近似并在文案里如实标注为「收藏」
      // 的做法会造假；这里直接不展示收藏，只给确实记录了的两项。
      bookmarks: 0,
      reposts: card.engagement.reposts,
      views: card.engagement.views,
    },
    id: card.id,
    relatedInstruments: relatedInstrumentsByPost[postId] ?? [],
    tags: card.tags,
    time: `${card.publishedLabel} · ${card.kind}`,
    title: card.title,
  };
};

export const allPostIds = (): readonly string[] =>
  communityFeedCards.map((card) => card.id);

export const postDetail = {
  author: "北岸观察员",
  authorId: "author_syn_northbank",
  body: [
    "这是一份完全虚构的社区观察笔记。我们用同一组固定样本反复练习：先描述信息，再写判断，最后补一个可能推翻判断的条件。",
    "第一步只记录能被复述的事实，不用形容词替代证据；如果来源、时间或口径不完整，就明确标记为待核验。",
    "第二步把判断写成暂时成立的假设，并列出它依赖的前提。这样后续信息变化时，可以知道究竟是哪一个前提发生了变化。",
    "第三步主动寻找反例。反例不等于唱反调，而是给判断设置一个能够被观察和复核的退出条件。",
    "最后保留版本线：每次更新只改变化的部分，并说明为什么改。这样一段时间以后，能看到自己是在根据证据更新，还是被结果牵着走。",
    "文中的数字、名称和情节都不指向真实投资对象；它们只用于演示帖子详情、互动与评论的阅读结构。",
  ],
  baselineCommentTotal: 32,
  /*
   * 原先是三只编出来的证券（星海智造 HQ001…）。「星海智造」还是早前从
   * 全站删掉的虚构标的，搜不到也没有页面——挂在「相关标的」底下就是一条
   * 指向已删除实体的悬空引用。换成真实 A 股，每条都能点回站内核对。
   */
  relatedInstruments: [
    { name: "贵州茅台", symbol: "sh600519" },
    { name: "招商银行", symbol: "sh600036" },
    { name: "宁德时代", symbol: "sz300750" },
  ],
  time: "今天 10:05 · 社区",
  title: "一份关于长期观察节奏的笔记",
} as const;
