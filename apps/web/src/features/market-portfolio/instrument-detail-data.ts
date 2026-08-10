import type { ListingMarket } from "./synthetic-data";

export type InstrumentPeriodId =
  "intraday" | "five-day" | "daily" | "weekly" | "monthly";

export type InstrumentDetailTabId =
  "discussion" | "constituents" | "news" | "announcements" | "etfs";

export type InstrumentChartSeries = Readonly<{
  id: InstrumentPeriodId;
  label: string;
  values: readonly number[];
  volumes: readonly number[];
}>;

export const instrumentPeriodOptions = [
  { id: "intraday", label: "分时" },
  { id: "five-day", label: "五日" },
  { id: "daily", label: "日 K" },
  { id: "weekly", label: "周 K" },
  { id: "monthly", label: "月 K" },
] as const satisfies readonly Readonly<{
  id: InstrumentPeriodId;
  label: string;
}>[];

export const instrumentChartSeries = [
  {
    id: "intraday",
    label: "分时",
    values: [0, 0.7, 0.2, 1.6, 1.15, 2.2, 1.7, 2.8, 2.35, 3.4, 3.05, 4.82],
    volumes: [30, 48, 38, 56, 43, 72, 51, 67, 58, 81, 63, 88],
  },
  {
    id: "five-day",
    label: "五日",
    values: [-1.4, -0.8, 0.1, -0.3, 1.25, 1.8, 2.65, 2.1, 3.75, 4.82],
    volumes: [42, 58, 39, 61, 53, 70, 64, 79, 68, 86],
  },
  {
    id: "daily",
    label: "日 K",
    values: [-5.2, -3.8, -4.4, -1.9, -0.7, 1.2, 0.4, 2.8, 3.6, 4.82],
    volumes: [54, 45, 62, 71, 58, 83, 66, 88, 77, 94],
  },
  {
    id: "weekly",
    label: "周 K",
    values: [-8.4, -5.3, -6.1, -2.2, 1.4, 0.6, 5.2, 3.9, 6.8, 4.82],
    volumes: [39, 46, 53, 61, 57, 72, 64, 81, 76, 69],
  },
  {
    id: "monthly",
    label: "月 K",
    values: [-12.1, -9.4, -5.8, -7.2, -1.6, 2.9, 7.4, 5.1, 9.2, 4.82],
    volumes: [44, 57, 51, 63, 70, 78, 91, 85, 96, 82],
  },
] as const satisfies readonly InstrumentChartSeries[];

export const instrumentDetailTabs = [
  { id: "discussion", label: "讨论" },
  { id: "constituents", label: "成分股" },
  { id: "news", label: "资讯" },
  { id: "announcements", label: "公告" },
  { id: "etfs", label: "相关 ETF" },
] as const satisfies readonly Readonly<{
  id: InstrumentDetailTabId;
  label: string;
}>[];

export const syntheticDiscussionPosts = [
  {
    id: "instrument_post_syn_0001",
    author: "合成观察员",
    at: "今天 14:18",
    title: "从订单节奏看制造方向的韧性",
    body: "固定合成快照显示，演示订单与交付节奏仍在区间上沿。本内容仅用于界面测试。",
    comments: 18,
    likes: 46,
  },
  {
    id: "instrument_post_syn_0002",
    author: "长期样本室",
    at: "今天 11:06",
    title: "波动放大后，先回到数据本身",
    body: "讨论价格之前，先核对合成数据时点和观察周期；这里没有真实荐股或交易指令。",
    comments: 31,
    likes: 72,
  },
] as const;

type SyntheticConstituent = Readonly<{
  code: string;
  name: string;
  weight: string;
  changePct: number;
}>;

export const syntheticConstituents: Readonly<
  Record<ListingMarket, readonly SyntheticConstituent[]>
> = {
  CN: [
    { name: "星港精工", code: "SYC101", weight: "12.80%", changePct: 2.31 },
    { name: "远湾材料", code: "SYC102", weight: "10.45%", changePct: -0.74 },
    { name: "明澈自动化", code: "SYC103", weight: "8.92%", changePct: 1.16 },
    { name: "云帆工业", code: "SYC104", weight: "7.36%", changePct: -1.08 },
  ],
  HK: [
    { name: "维港数科", code: "SYH201", weight: "14.20%", changePct: 1.82 },
    { name: "香江互联", code: "SYH202", weight: "11.34%", changePct: -0.63 },
    { name: "南湾服务", code: "SYH203", weight: "9.18%", changePct: 0.96 },
    { name: "港岛公用", code: "SYH204", weight: "6.74%", changePct: -1.22 },
  ],
  US: [
    {
      name: "Synthetic Cloud",
      code: "SUS301",
      weight: "15.62%",
      changePct: 2.48,
    },
    {
      name: "Northstar Labs",
      code: "SUS302",
      weight: "12.08%",
      changePct: -0.91,
    },
    { name: "Pacific Grid", code: "SUS303", weight: "9.73%", changePct: 1.37 },
    {
      name: "Harbor Logistics",
      code: "SUS304",
      weight: "7.11%",
      changePct: -1.66,
    },
  ],
};

export const syntheticInstrumentNews = [
  {
    id: "news_syn_0001",
    source: "火球合成资讯",
    at: "今天 13:42",
    title: "合成制造业订单保持韧性",
    summary: "固定演示样本中的新订单指数连续第三期位于景气区间。",
  },
  {
    id: "news_syn_0002",
    source: "演示市场播报",
    at: "今天 10:26",
    title: "观察池成交活跃度较上期回升",
    summary: "本条为离线合成内容，不对应任何真实公司或证券。",
  },
  {
    id: "news_syn_0003",
    source: "固定快照研究室",
    at: "昨天 18:05",
    title: "多周期样本出现分化",
    summary: "短周期热度较高，长周期仍处在演示区间中部。",
  },
] as const;

export const syntheticAnnouncements = [
  {
    id: "announcement_syn_0001",
    date: "2026-08-07",
    title: "固定合成样本参数更新说明",
  },
  {
    id: "announcement_syn_0002",
    date: "2026-08-01",
    title: "演示数据口径与风险提示",
  },
] as const;

export const syntheticRelatedEtfGroups = [
  {
    label: "美股 ETF",
    items: [
      {
        name: "合成制造 ETF-US",
        symbol: "SUS-ETF",
        price: "69.21",
        changePct: 0.23,
        targetListingId: "listing_syn_0006",
      },
      {
        name: "合成工业 ETF-US",
        symbol: "SUI-ETF",
        price: "22.14",
        changePct: -0.11,
        targetListingId: "listing_syn_0007",
      },
    ],
  },
  {
    label: "沪深 ETF",
    items: [
      {
        name: "先进制造 ETF",
        symbol: "SYC-ETF",
        price: "1.351",
        changePct: -0.44,
        targetListingId: "listing_syn_0010",
      },
      {
        name: "合成科创 ETF",
        symbol: "SYK-ETF",
        price: "2.084",
        changePct: 0.61,
        targetListingId: "listing_syn_0002",
      },
    ],
  },
] as const;

export const instrumentMarketSnapshots: Readonly<
  Record<
    ListingMarket,
    Readonly<{ volume: string; weekHighOffset: number; weekLowOffset: number }>
  >
> = {
  CN: { volume: "2.18 亿股", weekHighOffset: 0.14, weekLowOffset: -0.22 },
  HK: { volume: "8,640.7 万股", weekHighOffset: 0.18, weekLowOffset: -0.19 },
  US: { volume: "5,286.4 万股", weekHighOffset: 0.21, weekLowOffset: -0.24 },
};
