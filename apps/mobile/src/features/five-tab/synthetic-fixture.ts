export type MarketRegionId = "a" | "global" | "hk" | "us";

export type MarketRegion = Readonly<{
  id: MarketRegionId;
  label: string;
}>;

export type SyntheticMarketIndex = Readonly<{
  id: string;
  name: string;
  symbol: string;
  last: string;
  changePct: number;
}>;

export type SyntheticMarketRanking = Readonly<{
  id: string;
  name: string;
  symbol: string;
  last: string;
  changePct: number;
  listingId?: string;
}>;

export type SyntheticMarketSnapshot = Readonly<{
  region: MarketRegionId;
  source: "huoqiu-synthetic";
  asOf: "2026-08-11T06:30:00.000Z";
  indices: readonly SyntheticMarketIndex[];
  breadth: Readonly<{
    up: number;
    flat: number;
    down: number;
    heat: number;
  }>;
  ranking: readonly SyntheticMarketRanking[];
}>;

export const marketRegions = Object.freeze([
  Object.freeze({ id: "a", label: "A股" }),
  Object.freeze({ id: "hk", label: "港股" }),
  Object.freeze({ id: "us", label: "美股" }),
  Object.freeze({ id: "global", label: "全球" }),
] as const satisfies readonly MarketRegion[]);

const sharedMetadata = {
  asOf: "2026-08-11T06:30:00.000Z",
  source: "huoqiu-synthetic",
} as const;

const marketSnapshots: Readonly<
  Record<MarketRegionId, SyntheticMarketSnapshot>
> = Object.freeze({
  a: Object.freeze({
    ...sharedMetadata,
    breadth: Object.freeze({ down: 1_842, flat: 186, heat: 58, up: 2_996 }),
    indices: Object.freeze([
      Object.freeze({
        changePct: 0.82,
        id: "index_syn_a_0001",
        last: "3,428.16",
        name: "合成沪指",
        symbol: "SYN-A01",
      }),
      Object.freeze({
        changePct: 1.14,
        id: "index_syn_a_0002",
        last: "10,864.32",
        name: "合成深指",
        symbol: "SYN-A02",
      }),
      Object.freeze({
        changePct: -0.27,
        id: "index_syn_a_0003",
        last: "2,248.09",
        name: "合成科创",
        symbol: "SYN-A03",
      }),
    ]),
    ranking: Object.freeze([
      Object.freeze({
        changePct: 6.42,
        id: "rank_syn_a_0001",
        last: "108.64",
        listingId: "listing_syn_0001",
        name: "合成示例一号",
        symbol: "SYN001",
      }),
      Object.freeze({
        changePct: 4.18,
        id: "rank_syn_a_0002",
        last: "42.16",
        name: "云帆材料",
        symbol: "SYN-A18",
      }),
      Object.freeze({
        changePct: 3.76,
        id: "rank_syn_a_0003",
        last: "76.30",
        name: "星港智造",
        symbol: "SYN-A26",
      }),
    ]),
    region: "a",
  }),
  global: Object.freeze({
    ...sharedMetadata,
    breadth: Object.freeze({ down: 934, flat: 118, heat: 51, up: 1_006 }),
    indices: Object.freeze([
      Object.freeze({
        changePct: 0.31,
        id: "index_syn_global_0001",
        last: "1,842.20",
        name: "合成全球50",
        symbol: "SYN-G01",
      }),
      Object.freeze({
        changePct: -0.19,
        id: "index_syn_global_0002",
        last: "963.18",
        name: "合成成长",
        symbol: "SYN-G02",
      }),
      Object.freeze({
        changePct: 0.08,
        id: "index_syn_global_0003",
        last: "728.45",
        name: "合成价值",
        symbol: "SYN-G03",
      }),
    ]),
    ranking: Object.freeze([
      Object.freeze({
        changePct: 4.08,
        id: "rank_syn_global_0001",
        last: "92.40",
        name: "极光网络",
        symbol: "SYN-G08",
      }),
      Object.freeze({
        changePct: 2.94,
        id: "rank_syn_global_0002",
        last: "118.06",
        name: "远岚消费",
        symbol: "SYN-G16",
      }),
      Object.freeze({
        changePct: 2.22,
        id: "rank_syn_global_0003",
        last: "63.18",
        name: "新源能源",
        symbol: "SYN-G23",
      }),
    ]),
    region: "global",
  }),
  hk: Object.freeze({
    ...sharedMetadata,
    breadth: Object.freeze({ down: 742, flat: 91, heat: 46, up: 618 }),
    indices: Object.freeze([
      Object.freeze({
        changePct: -0.36,
        id: "index_syn_hk_0001",
        last: "19,628.40",
        name: "合成港股主板",
        symbol: "SYN-H01",
      }),
      Object.freeze({
        changePct: 0.55,
        id: "index_syn_hk_0002",
        last: "4,206.11",
        name: "合成港科",
        symbol: "SYN-H02",
      }),
      Object.freeze({
        changePct: -0.08,
        id: "index_syn_hk_0003",
        last: "7,836.52",
        name: "合成国企",
        symbol: "SYN-H03",
      }),
    ]),
    ranking: Object.freeze([
      Object.freeze({
        changePct: 5.62,
        id: "rank_syn_hk_0001",
        last: "68.35",
        name: "海岚科技",
        symbol: "SYN-H08",
      }),
      Object.freeze({
        changePct: 3.44,
        id: "rank_syn_hk_0002",
        last: "24.70",
        name: "湾区物流",
        symbol: "SYN-H17",
      }),
      Object.freeze({
        changePct: 2.91,
        id: "rank_syn_hk_0003",
        last: "15.88",
        name: "明珠医药",
        symbol: "SYN-H29",
      }),
    ]),
    region: "hk",
  }),
  us: Object.freeze({
    ...sharedMetadata,
    breadth: Object.freeze({ down: 2_041, flat: 202, heat: 63, up: 3_487 }),
    indices: Object.freeze([
      Object.freeze({
        changePct: 0.48,
        id: "index_syn_us_0001",
        last: "42,186.27",
        name: "合成工业30",
        symbol: "SYN-U01",
      }),
      Object.freeze({
        changePct: 0.92,
        id: "index_syn_us_0002",
        last: "18,306.54",
        name: "合成科技100",
        symbol: "SYN-U02",
      }),
      Object.freeze({
        changePct: -0.14,
        id: "index_syn_us_0003",
        last: "5,264.18",
        name: "合成宽基500",
        symbol: "SYN-U03",
      }),
    ]),
    ranking: Object.freeze([
      Object.freeze({
        changePct: 7.18,
        id: "rank_syn_us_0001",
        last: "231.42",
        name: "Rubin Lab",
        symbol: "SYN-U08",
      }),
      Object.freeze({
        changePct: 4.66,
        id: "rank_syn_us_0002",
        last: "146.90",
        name: "Northstar Cloud",
        symbol: "SYN-U12",
      }),
      Object.freeze({
        changePct: 3.28,
        id: "rank_syn_us_0003",
        last: "84.15",
        name: "Harbor Energy",
        symbol: "SYN-U21",
      }),
    ]),
    region: "us",
  }),
});

export const getMarketSnapshot = (
  region: MarketRegionId,
): SyntheticMarketSnapshot => marketSnapshots[region];

export type PortfolioPeriodId = "day" | "week" | "year";

export type PortfolioPeriod = Readonly<{
  id: PortfolioPeriodId;
  label: string;
}>;

export type SyntheticPortfolioRanking = Readonly<{
  id: string;
  title: string;
  manager: string;
  followers: number;
  riskLabel: string;
  returnPct: number;
}>;

export type SyntheticPortfolioHub = Readonly<{
  source: "huoqiu-synthetic";
  asOf: "2026-08-11T06:30:00.000Z";
  summary: Readonly<{
    profit: 69.97;
    loss: 29.87;
    flat: 0.16;
  }>;
  signals: readonly Readonly<{
    id: string;
    label: string;
    value: string;
    caption: string;
  }>[];
  ranking: readonly SyntheticPortfolioRanking[];
}>;

export type SyntheticPortfolioDetail = Readonly<{
  id: string;
  source: "huoqiu-synthetic";
  asOf: "2026-08-11T06:30:00.000Z";
  title: string;
  manager: string;
  description: string;
  sinceInceptionPct: number;
  maxDrawdownPct: number;
  followers: number;
  holdings: readonly Readonly<{
    id: string;
    name: string;
    symbol: string;
    weightPct: number;
    changePct: number;
  }>[];
  adjustments: readonly Readonly<{
    id: string;
    at: string;
    action: "模拟调仓";
    note: string;
  }>[];
}>;

export const portfolioPeriods = Object.freeze([
  Object.freeze({ id: "day", label: "日榜" }),
  Object.freeze({ id: "week", label: "周榜" }),
  Object.freeze({ id: "year", label: "年榜" }),
] as const satisfies readonly PortfolioPeriod[]);

type PortfolioCatalogEntry = Readonly<{
  detail: SyntheticPortfolioDetail;
  riskLabel: string;
  returns: Readonly<Record<PortfolioPeriodId, number>>;
}>;

const portfolioCatalog: readonly PortfolioCatalogEntry[] = Object.freeze([
  Object.freeze({
    detail: Object.freeze({
      ...sharedMetadata,
      adjustments: Object.freeze([
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-11T05:40:00.000Z",
          id: "adjustment_syn_0001",
          note: "将云帆材料的合成权重由 24% 调整为 28%。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-08T07:20:00.000Z",
          id: "adjustment_syn_0002",
          note: "降低星港智造的合成权重，控制组合波动。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-05T02:10:00.000Z",
          id: "adjustment_syn_0003",
          note: "首次加入合成示例一号，仅用于界面演示。",
        }),
      ]),
      description: "跟踪合成科技与材料主题的公开观察组合。",
      followers: 12_680,
      holdings: Object.freeze([
        Object.freeze({
          changePct: 6.42,
          id: "holding_syn_0001",
          name: "合成示例一号",
          symbol: "SYN001",
          weightPct: 36,
        }),
        Object.freeze({
          changePct: 4.18,
          id: "holding_syn_0002",
          name: "云帆材料",
          symbol: "SYN-A18",
          weightPct: 28,
        }),
        Object.freeze({
          changePct: -0.82,
          id: "holding_syn_0003",
          name: "星港智造",
          symbol: "SYN-A26",
          weightPct: 22,
        }),
      ]),
      id: "portfolio_syn_0001",
      manager: "合成用户甲",
      maxDrawdownPct: -6.24,
      sinceInceptionPct: 18.64,
      title: "星河观察组合",
    }),
    returns: Object.freeze({ day: 6.28, week: 12.46, year: 38.42 }),
    riskLabel: "中性波动",
  }),
  Object.freeze({
    detail: Object.freeze({
      ...sharedMetadata,
      adjustments: Object.freeze([
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-10T03:00:00.000Z",
          id: "adjustment_syn_0101",
          note: "维持合成宽基配置，不产生任何真实交易。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-07T03:00:00.000Z",
          id: "adjustment_syn_0102",
          note: "增加合成现金观察比例。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-04T03:00:00.000Z",
          id: "adjustment_syn_0103",
          note: "更新组合演示说明。",
        }),
      ]),
      description: "以低波动宽基为主题的纯合成观察组合。",
      followers: 8_240,
      holdings: Object.freeze([
        Object.freeze({
          changePct: 0.31,
          id: "holding_syn_0101",
          name: "合成全球50",
          symbol: "SYN-G01",
          weightPct: 42,
        }),
        Object.freeze({
          changePct: 0.08,
          id: "holding_syn_0102",
          name: "合成价值",
          symbol: "SYN-G03",
          weightPct: 31,
        }),
        Object.freeze({
          changePct: -0.14,
          id: "holding_syn_0103",
          name: "合成宽基500",
          symbol: "SYN-U03",
          weightPct: 17,
        }),
      ]),
      id: "portfolio_syn_0002",
      manager: "合成用户乙",
      maxDrawdownPct: -3.18,
      sinceInceptionPct: 14.27,
      title: "稳健宽基组合",
    }),
    returns: Object.freeze({ day: 4.16, week: 9.82, year: 32.16 }),
    riskLabel: "低波稳健",
  }),
  Object.freeze({
    detail: Object.freeze({
      ...sharedMetadata,
      adjustments: Object.freeze([
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-09T10:30:00.000Z",
          id: "adjustment_syn_0201",
          note: "调整合成港科主题比例。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-06T10:30:00.000Z",
          id: "adjustment_syn_0202",
          note: "观察全球合成成长板块。",
        }),
        Object.freeze({
          action: "模拟调仓",
          at: "2026-08-03T10:30:00.000Z",
          id: "adjustment_syn_0203",
          note: "建立纯合成组合快照。",
        }),
      ]),
      description: "观察多个合成市场的成长主题组合。",
      followers: 6_912,
      holdings: Object.freeze([
        Object.freeze({
          changePct: 0.55,
          id: "holding_syn_0201",
          name: "合成港科",
          symbol: "SYN-H02",
          weightPct: 38,
        }),
        Object.freeze({
          changePct: -0.19,
          id: "holding_syn_0202",
          name: "合成成长",
          symbol: "SYN-G02",
          weightPct: 29,
        }),
        Object.freeze({
          changePct: 0.92,
          id: "holding_syn_0203",
          name: "合成科技100",
          symbol: "SYN-U02",
          weightPct: 21,
        }),
      ]),
      id: "portfolio_syn_0003",
      manager: "合成用户丙",
      maxDrawdownPct: -8.05,
      sinceInceptionPct: 11.38,
      title: "多市场成长组合",
    }),
    returns: Object.freeze({ day: 3.52, week: 8.64, year: 25.8 }),
    riskLabel: "成长波动",
  }),
]);

const portfolioSummary = Object.freeze({
  flat: 0.16,
  loss: 29.87,
  profit: 69.97,
} as const);

const portfolioSignals = Object.freeze([
  Object.freeze({
    caption: "最近一小时的合成组合加仓观察",
    id: "signal_syn_0001",
    label: "调仓热度",
    value: "偏积极",
  }),
  Object.freeze({
    caption: "基于固定快照计算，不连接真实账户",
    id: "signal_syn_0002",
    label: "回撤温度",
    value: "中性",
  }),
  Object.freeze({
    caption: "仅展示合成关注计数",
    id: "signal_syn_0003",
    label: "关注变化",
    value: "+12%",
  }),
]);

export const getPortfolioHub = (
  period: PortfolioPeriodId,
): SyntheticPortfolioHub => ({
  ...sharedMetadata,
  ranking: portfolioCatalog.map(({ detail, returns, riskLabel }) => ({
    followers: detail.followers,
    id: detail.id,
    manager: detail.manager,
    returnPct: returns[period],
    riskLabel,
    title: detail.title,
  })),
  signals: portfolioSignals,
  summary: portfolioSummary,
});

export const getPortfolioDetail = (
  portfolioId: string,
): SyntheticPortfolioDetail | undefined =>
  portfolioCatalog.find(({ detail }) => detail.id === portfolioId)?.detail;

export type ProfileDestination =
  "messages" | "portfolios" | "settings" | "watchlist";

export type SyntheticProfile = Readonly<{
  id: string;
  alias: string;
  bio: string;
  source: "huoqiu-synthetic";
  sessionDisclosure: string;
  entries: readonly Readonly<{
    destination: ProfileDestination;
    label: string;
    meta: string;
  }>[];
  unavailableCapabilities: readonly string[];
}>;

export const syntheticProfile: SyntheticProfile = Object.freeze({
  alias: "合成观察员 017",
  bio: "记录公开市场信息与合成组合，不提供投资建议。",
  entries: Object.freeze([
    Object.freeze({
      destination: "messages",
      label: "消息",
      meta: "3 条合成未读",
    }),
    Object.freeze({
      destination: "settings",
      label: "设置",
      meta: "偏好与披露",
    }),
    Object.freeze({
      destination: "watchlist",
      label: "自选",
      meta: "本次会话",
    }),
    Object.freeze({
      destination: "portfolios",
      label: "组合",
      meta: "3 个合成组合",
    }),
  ]),
  id: "profile_syn_0017",
  sessionDisclosure: "数据仅保留于本次演示会话，刷新后可以重置。",
  source: "huoqiu-synthetic",
  unavailableCapabilities: Object.freeze([
    "证券账户（未开放）",
    "基金账户（未开放）",
    "真实交易（未开放）",
  ]),
});

export type SyntheticMessage = Readonly<{
  id: string;
  kind: "回复" | "系统" | "赞";
  title: string;
  body: string;
  at: string;
  source: "huoqiu-synthetic";
}>;

export const syntheticMessages: readonly SyntheticMessage[] = Object.freeze([
  Object.freeze({
    at: "2026-08-11T06:18:00.000Z",
    body: "你关于合成示例一号的观察收到一条演示回复。",
    id: "message_syn_0001",
    kind: "回复",
    source: "huoqiu-synthetic",
    title: "合成用户乙回复了你",
  }),
  Object.freeze({
    at: "2026-08-11T05:42:00.000Z",
    body: "星河观察组合的固定快照已更新。",
    id: "message_syn_0002",
    kind: "系统",
    source: "huoqiu-synthetic",
    title: "合成组合快照更新",
  }),
  Object.freeze({
    at: "2026-08-10T13:06:00.000Z",
    body: "一条演示内容获得了合成点赞。",
    id: "message_syn_0003",
    kind: "赞",
    source: "huoqiu-synthetic",
    title: "合成用户丙赞了你",
  }),
]);

export type SettingsDensity = "comfortable" | "compact";

export const settingsDensityOptions = Object.freeze([
  Object.freeze({ id: "comfortable", label: "舒适" }),
  Object.freeze({ id: "compact", label: "紧凑" }),
] as const satisfies readonly Readonly<{
  id: SettingsDensity;
  label: string;
}>[]);
