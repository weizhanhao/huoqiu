import type { ListingMarket } from "./synthetic-data";

export type InstrumentPeriodId =
  "intraday" | "five-day" | "daily" | "weekly" | "monthly";

export type InstrumentDetailTabId =
  "discussion" | "profile" | "constituents" | "news" | "announcements" | "etfs";

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
  { id: "profile", label: "资料" },
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
    author: "样本观察员",
    at: "今天 14:18",
    title: "从订单节奏看制造方向的韧性",
    body: "固定样本快照显示，演示订单与交付节奏仍在区间上沿。本内容仅用于界面测试。",
    comments: 18,
    likes: 46,
  },
  {
    id: "instrument_post_syn_0002",
    author: "长期样本室",
    at: "今天 11:06",
    title: "波动放大后，先回到数据本身",
    body: "讨论价格之前，先核对样本数据时点和观察周期；这里没有真实荐股或交易指令。",
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
    source: "火球样本资讯",
    at: "今天 13:42",
    title: "样本制造业订单保持韧性",
    summary: "固定演示样本中的新订单指数连续第三期位于景气区间。",
  },
  {
    id: "news_syn_0002",
    source: "演示市场播报",
    at: "今天 10:26",
    title: "观察池成交活跃度较上期回升",
    summary: "本条为离线样本内容，不对应任何真实公司或证券。",
  },
  {
    id: "news_syn_0003",
    source: "样本 · 非实时研究室",
    at: "昨天 18:05",
    title: "多周期样本出现分化",
    summary: "短周期热度较高，长周期仍处在演示区间中部。",
  },
] as const;

/*
 * 公告列表。全部为虚构公告标题，不对应任何真实上市公司披露。
 * 条数做到 11 条是为了让分页有意义——2 条时分页控件形同虚设。
 */
export const syntheticAnnouncements = [
  {
    date: "2026-08-07",
    id: "announcement_syn_0001",
    title: "固定样本参数更新说明",
  },
  {
    date: "2026-08-01",
    id: "announcement_syn_0002",
    title: "演示数据口径与风险提示",
  },
  {
    date: "2026-07-28",
    id: "announcement_syn_0003",
    title: "样本成分调整与权重再平衡公告",
  },
  {
    date: "2026-07-22",
    id: "announcement_syn_0004",
    title: "演示季度经营数据发布安排",
  },
  {
    date: "2026-07-15",
    id: "announcement_syn_0005",
    title: "虚构董事会决议摘要（演示）",
  },
  {
    date: "2026-07-09",
    id: "announcement_syn_0006",
    title: "样本分红方案与除权除息说明",
  },
  {
    date: "2026-07-02",
    id: "announcement_syn_0007",
    title: "演示用关联交易披露格式示例",
  },
  {
    date: "2026-06-25",
    id: "announcement_syn_0008",
    title: "虚构股东减持计划预披露（演示）",
  },
  {
    date: "2026-06-18",
    id: "announcement_syn_0009",
    title: "样本回购方案实施进展",
  },
  {
    date: "2026-06-11",
    id: "announcement_syn_0010",
    title: "演示用募集资金使用情况说明",
  },
  {
    date: "2026-06-04",
    id: "announcement_syn_0011",
    title: "虚构高管变更公告（演示）",
  },
] as const;

/** 公告每页条数。 */
export const ANNOUNCEMENTS_PER_PAGE = 5;

export const syntheticRelatedEtfGroups = [
  {
    label: "美股 ETF",
    items: [
      {
        name: "样本制造 ETF-US",
        symbol: "SUS-ETF",
        price: "69.21",
        changePct: 0.23,
        targetListingId: "listing_syn_0006",
      },
      {
        name: "样本工业 ETF-US",
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
        name: "样本科创 ETF",
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

/*
 * 标的资料（对应雪球的 F10）。
 *
 * 全部为虚构公司与虚构财务数字。这是运营/演示内容，不是财经资讯——
 * 不涉及任何真实上市公司的经营数据，也不从外部抓取。
 *
 * 按 listingId 的尾号派生，让不同标的看到不同资料，
 * 而不是所有标的共用一份（ETF 详情就踩过这个坑）。
 */
export type InstrumentProfile = Readonly<{
  business: string;
  financials: readonly Readonly<{
    label: string;
    value: string;
    yoy: number;
  }>[];
  founded: string;
  headquarters: string;
  industry: string;
  employees: string;
  shareholders: readonly Readonly<{
    name: string;
    nature: string;
    sharePct: number;
  }>[];
  valuation: readonly Readonly<{ label: string; value: string }>[];
}>;

const fallbackProfile: InstrumentProfile = {
  business:
    "虚构的高端装备制造商，演示用经营描述：以精密部件与产线集成为主，客户集中在样本制造样本池内。",
  employees: "12,400 人（演示）",
  financials: [
    { label: "营业收入", value: "184.6 亿", yoy: 12.4 },
    { label: "归母净利润", value: "21.3 亿", yoy: 8.7 },
    { label: "毛利率", value: "28.4%", yoy: 1.2 },
    { label: "经营现金流", value: "26.8 亿", yoy: -3.5 },
  ],
  founded: "1998 年（演示）",
  headquarters: "演示市 · 星港区",
  industry: "高端装备制造",
  shareholders: [
    { name: "星港控股集团（演示）", nature: "境内法人", sharePct: 32.4 },
    { name: "样本产业基金一号", nature: "基金", sharePct: 8.6 },
    { name: "演示社保组合 104", nature: "社保基金", sharePct: 4.2 },
    { name: "北岸资产管理（演示）", nature: "境内法人", sharePct: 3.1 },
  ],
  valuation: [
    { label: "市盈率 TTM", value: "18.4" },
    { label: "市净率", value: "2.16" },
    { label: "总市值", value: "392 亿（演示）" },
    { label: "流通市值", value: "268 亿（演示）" },
  ],
};

const profileArchetypes: readonly InstrumentProfile[] = [
  fallbackProfile,
  {
    business:
      "虚构的信息技术服务商，演示用经营描述：提供样本云计算与数据平台服务，收入以订阅形式确认。",
    employees: "8,760 人（演示）",
    financials: [
      { label: "营业收入", value: "96.2 亿", yoy: 24.8 },
      { label: "归母净利润", value: "14.7 亿", yoy: 31.2 },
      { label: "毛利率", value: "61.3%", yoy: 2.8 },
      { label: "经营现金流", value: "19.4 亿", yoy: 18.6 },
    ],
    founded: "2009 年（演示）",
    headquarters: "演示市 · 湾区",
    industry: "信息技术服务",
    shareholders: [
      { name: "湾区数字控股（演示）", nature: "境内法人", sharePct: 27.8 },
      { name: "北岸成长优选", nature: "基金", sharePct: 11.4 },
      { name: "演示创投二期", nature: "有限合伙", sharePct: 6.9 },
      { name: "管理层持股平台（演示）", nature: "有限合伙", sharePct: 5.3 },
    ],
    valuation: [
      { label: "市盈率 TTM", value: "42.7" },
      { label: "市净率", value: "6.84" },
      { label: "总市值", value: "628 亿（演示）" },
      { label: "流通市值", value: "441 亿（演示）" },
    ],
  },
  {
    business:
      "虚构的公用事业运营商，演示用经营描述：以区域供水供电特许经营为主，现金流稳定、资本开支周期长。",
    employees: "5,320 人（演示）",
    financials: [
      { label: "营业收入", value: "62.8 亿", yoy: 3.6 },
      { label: "归母净利润", value: "11.2 亿", yoy: 5.1 },
      { label: "毛利率", value: "34.7%", yoy: 0.4 },
      { label: "经营现金流", value: "18.9 亿", yoy: 2.2 },
    ],
    founded: "1993 年（演示）",
    headquarters: "演示市 · 维港",
    industry: "公用事业",
    shareholders: [
      { name: "维港市政集团（演示）", nature: "国有法人", sharePct: 48.6 },
      { name: "演示保险资管账户", nature: "保险机构", sharePct: 7.2 },
      { name: "衡宇稳健配置", nature: "基金", sharePct: 3.8 },
      { name: "演示社保组合 211", nature: "社保基金", sharePct: 2.6 },
    ],
    valuation: [
      { label: "市盈率 TTM", value: "12.1" },
      { label: "市净率", value: "1.34" },
      { label: "总市值", value: "186 亿（演示）" },
      { label: "流通市值", value: "152 亿（演示）" },
    ],
  },
];

export const getInstrumentProfile = (listingId: string): InstrumentProfile => {
  // 用尾号取模而非随机数：同一标的每次进来必须看到同一份资料。
  const digits = listingId.replace(/\D/gu, "");
  const index =
    digits.length === 0
      ? 0
      : Number(digits.slice(-2)) % profileArchetypes.length;
  // find 而非索引：noUncheckedIndexedAccess 下索引恒为 T | undefined，
  // 而这里数组非空是编译期已知的事实，用 find + 兜底表达更直接。
  const picked = profileArchetypes.find((_, position) => position === index);
  return picked ?? fallbackProfile;
};
