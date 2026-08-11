export const syntheticProfileFixture = {
  avatarInitials: "火",
  bio: "用固定合成数据记录公开市场观察。",
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

export const profileTabs = ["activity", "favorites", "following"] as const;
export type ProfileTab = (typeof profileTabs)[number];

export const profileTabLabels: Readonly<Record<ProfileTab, string>> = {
  activity: "动态",
  favorites: "收藏",
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
      meta: "今天 10:05 · 合成动态",
      title: "本周公开数据观察清单",
    },
    {
      description: "复盘一条观点需要哪些可验证证据，以及什么条件会推翻它。",
      href: "/community",
      meta: "昨天 16:30 · 合成动态",
      title: "给观察结论补一条反证",
    },
  ],
  favorites: [
    {
      description: "收藏的标的观察来自固定快照，不代表真实持仓或交易建议。",
      href: "/instruments/listing_syn_0001",
      meta: "合成标的 · 固定快照",
      title: "合成成长样本 SYN-A",
    },
    {
      description: "收藏的组合仅用于演示信息结构与导航闭环。",
      href: "/portfolios/portfolio_syn_0001",
      meta: "合成组合 · 演示",
      title: "稳健观察组合",
    },
  ],
  following: [
    {
      description: "关注关系为固定 fixture，不连接真实人物或社交图谱。",
      href: "/community/posts/post_syn_0001",
      meta: "合成作者 · 12 篇观察",
      title: "北岸观察员",
    },
    {
      description: "市场资料室整理离线合成资讯卡片，仅供界面演示。",
      href: "/community",
      meta: "合成作者 · 8 篇资料",
      title: "市场资料室",
    },
  ],
};
