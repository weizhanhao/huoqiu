export const syntheticProfileFixture = {
  avatarInitials: "火",
  bio: "用固定数据记录公开市场观察。",
  displayName: "火球演示用户",
  handle: "@huoqiu_demo",
  stats: {
    favorites: 38,
    followers: 186,
    following: 24,
    posts: 12,
  },
  userId: "user_demo_0001",
} as const;

export type SyntheticProfile = Readonly<{
  avatarInitials: string;
  bio: string;
  displayName: string;
  handle: string;
  stats: Readonly<{
    favorites: number;
    followers: number;
    following: number;
    posts: number;
  }>;
  userId: string;
}>;

export const profileTabs = [
  "activity",
  "favorites",
  "following",
  "followers",
] as const;
export type ProfileTab = (typeof profileTabs)[number];

export const profileTabLabels: Readonly<Record<ProfileTab, string>> = {
  activity: "动态",
  favorites: "收藏",
  followers: "粉丝",
  following: "关注",
};

export const profileTabItems: Readonly<
  Record<
    ProfileTab,
    readonly Readonly<{
      description: string;
      href: string;
      meta: string;
      title: string;
    }>[]
  >
> = {
  activity: [
    {
      description: "把经营、估值与市场情绪拆开记录，所有内容均为固定离线样本。",
      href: "/community/posts/post_syn_0001",
      meta: "今天 10:05 · 动态",
      title: "本周公开数据观察清单",
    },
    {
      description: "复盘一条观点需要哪些可验证证据，以及什么条件会推翻它。",
      href: "/community",
      meta: "昨天 16:30 · 动态",
      title: "给观察结论补一条反证",
    },
  ],
  /*
   * 这两条原先指向 /instruments/listing_syn_0001 和
   * /portfolios/portfolio_syn_0001——那批虚构标的与虚构组合在换成真实数据时
   * 一起删掉了，链接却留着，点进去是「没有找到这个页面」。
   *
   * 这一页是演示身份页，内容是样本没关系；但样本不等于可以点出 404。
   * 改成指向真实存在的页面：一只真股票，和真实的公开组合榜。
   */
  favorites: [
    {
      description: "收藏一只标的后，它的行情与讨论都在标的页里。",
      href: "/instruments/sh600519",
      meta: "标的 · 沪市",
      title: "贵州茅台",
    },
    {
      description: "公开组合榜按真实收益排序，可以从这里找到要跟的组合。",
      href: "/portfolios",
      meta: "组合 · 公开榜",
      title: "组合榜",
    },
  ],
  following: [
    {
      description: "关注关系为固定 fixture，不连接真实人物或社交图谱。",
      href: "/community/posts/post_syn_0001",
      meta: "作者 · 12 篇观察",
      title: "北岸观察员",
    },
    {
      description: "市场资料室整理离线资讯卡片，仅供界面演示。",
      href: "/community",
      meta: "作者 · 8 篇资料",
      title: "市场资料室",
    },
  ],
  followers: [
    {
      description: "观察作者，关注宏观与制造方向的固定演示样本。",
      href: "/creators",
      meta: "粉丝 · 今天",
      title: "北岸观察员",
    },
    {
      description: "资料编辑，整理内容标注与来源字段。",
      href: "/creators",
      meta: "粉丝 · 昨天",
      title: "市场资料室",
    },
    {
      description: "研究小组，用问题卡练习反证与复盘。",
      href: "/creators",
      meta: "粉丝 · 2 天前",
      title: "研究练习社",
    },
    {
      description: "指数作者，通过虚构指数样本演示笔记结构。",
      href: "/creators",
      meta: "粉丝 · 3 天前",
      title: "指数散步者",
    },
  ],
};
