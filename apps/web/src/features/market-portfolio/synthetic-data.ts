export type ListingMarket = "CN" | "HK" | "US";
export type MarketView = ListingMarket | "GLOBAL";
export type RankingMarket = ListingMarket | "ALL";
export type RankingDirection = "gainers" | "losers";

export type SyntheticListing = Readonly<{
  listingId: string;
  symbol: string;
  name: string;
  market: ListingMarket;
  marketLabel: string;
  currency: string;
  price: string;
  changePct: number;
  source: "huoqiu-synthetic";
  synthetic: true;
}>;

export const syntheticListings = [
  {
    listingId: "listing_syn_0001",
    symbol: "SYN001",
    name: "星海智造",
    market: "CN",
    marketLabel: "A 股",
    currency: "CNY",
    price: "108.64",
    changePct: 1.1734,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0002",
    symbol: "SYN002",
    name: "星港制造",
    market: "CN",
    marketLabel: "A 股",
    currency: "CNY",
    price: "42.68",
    changePct: 4.82,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0003",
    symbol: "SYN003",
    name: "澄明消费",
    market: "CN",
    marketLabel: "A 股",
    currency: "CNY",
    price: "76.21",
    changePct: -2.36,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0004",
    symbol: "SYN004",
    name: "香江科技",
    market: "HK",
    marketLabel: "港股",
    currency: "HKD",
    price: "91.30",
    changePct: 3.71,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0005",
    symbol: "SYN005",
    name: "维港公用",
    market: "HK",
    marketLabel: "港股",
    currency: "HKD",
    price: "24.16",
    changePct: -1.84,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0006",
    symbol: "SYN006",
    name: "纳斯达克云服务",
    market: "US",
    marketLabel: "美股",
    currency: "USD",
    price: "168.42",
    changePct: 5.26,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0007",
    symbol: "SYN007",
    name: "北美稳健",
    market: "US",
    marketLabel: "美股",
    currency: "USD",
    price: "58.09",
    changePct: -3.15,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0008",
    symbol: "SYN008",
    name: "环球清洁能源",
    market: "US",
    marketLabel: "美股",
    currency: "USD",
    price: "33.74",
    changePct: 2.43,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0009",
    symbol: "SYN009",
    name: "全球航运",
    market: "HK",
    marketLabel: "港股",
    currency: "HKD",
    price: "17.82",
    changePct: -4.12,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0010",
    symbol: "SYN010",
    name: "景元医药",
    market: "CN",
    marketLabel: "A 股",
    currency: "CNY",
    price: "65.47",
    changePct: 0.88,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0011",
    symbol: "SYN011",
    name: "湾区数字服务",
    market: "HK",
    marketLabel: "港股",
    currency: "HKD",
    price: "51.06",
    changePct: 1.62,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
  {
    listingId: "listing_syn_0012",
    symbol: "SYN012",
    name: "太平洋物流",
    market: "US",
    marketLabel: "美股",
    currency: "USD",
    price: "87.55",
    changePct: -0.96,
    source: "huoqiu-synthetic",
    synthetic: true,
  },
] as const satisfies readonly SyntheticListing[];

export const marketTabs: readonly Readonly<{
  id: MarketView;
  label: string;
}>[] = [
  { id: "CN", label: "A 股" },
  { id: "HK", label: "港股" },
  { id: "US", label: "美股" },
  { id: "GLOBAL", label: "全球" },
];

export const rankingMarketTabs: readonly Readonly<{
  id: RankingMarket;
  label: string;
}>[] = [
  { id: "ALL", label: "全部市场" },
  { id: "CN", label: "A 股" },
  { id: "HK", label: "港股" },
  { id: "US", label: "美股" },
];

type SyntheticIndex = Readonly<{
  name: string;
  price: string;
  changePct: number;
  trend: readonly number[];
}>;

export const marketIndices: Readonly<
  Record<MarketView, readonly SyntheticIndex[]>
> = {
  CN: [
    {
      name: "火球 A50",
      price: "3,486.12",
      changePct: 1.26,
      trend: [18, 16, 17, 13, 12, 8],
    },
    {
      name: "样本科创 50",
      price: "1,102.84",
      changePct: 2.14,
      trend: [19, 18, 14, 15, 10, 7],
    },
    {
      name: "样本中小盘",
      price: "6,731.09",
      changePct: -0.42,
      trend: [8, 10, 9, 13, 12, 16],
    },
  ],
  HK: [
    {
      name: "恒生样本指数",
      price: "25,186.40",
      changePct: 0.94,
      trend: [19, 16, 17, 12, 11, 8],
    },
    {
      name: "港股样本科技",
      price: "5,882.13",
      changePct: 1.73,
      trend: [20, 17, 13, 15, 9, 6],
    },
    {
      name: "维港国企指数",
      price: "9,031.72",
      changePct: -0.31,
      trend: [8, 9, 11, 10, 14, 15],
    },
  ],
  US: [
    {
      name: "火球美股 100",
      price: "19,840.55",
      changePct: 0.68,
      trend: [17, 15, 16, 12, 9, 7],
    },
    {
      name: "样本科技综合",
      price: "17,306.11",
      changePct: 1.39,
      trend: [20, 18, 15, 11, 12, 6],
    },
    {
      name: "北美价值 30",
      price: "42,078.66",
      changePct: -0.18,
      trend: [8, 9, 8, 12, 13, 15],
    },
  ],
  GLOBAL: [
    {
      name: "火球全球 100",
      price: "8,406.72",
      changePct: 0.81,
      trend: [19, 17, 15, 13, 10, 7],
    },
    {
      name: "全球样本成长",
      price: "4,219.60",
      changePct: 1.46,
      trend: [21, 18, 14, 15, 9, 5],
    },
    {
      name: "全球样本价值",
      price: "3,768.24",
      changePct: -0.22,
      trend: [8, 10, 9, 11, 13, 15],
    },
  ],
};

export const marketBreadth: Readonly<
  Record<
    MarketView,
    Readonly<{ advances: number; flat: number; declines: number; heat: number }>
  >
> = {
  CN: { advances: 2864, flat: 182, declines: 1941, heat: 68 },
  HK: { advances: 968, flat: 103, declines: 741, heat: 63 },
  US: { advances: 3120, flat: 266, declines: 2714, heat: 61 },
  GLOBAL: { advances: 6952, flat: 551, declines: 5396, heat: 65 },
};

type MarketConcept = Readonly<{ name: string; value: number }>;

export const marketConcepts: Readonly<
  Record<MarketView, readonly MarketConcept[]>
> = {
  CN: [
    { name: "先进制造", value: 3.8 },
    { name: "样本算力", value: 2.9 },
    { name: "创新药", value: 1.7 },
  ],
  HK: [
    { name: "平台科技", value: 3.1 },
    { name: "高股息", value: 1.2 },
    { name: "航运", value: -2.8 },
  ],
  US: [
    { name: "云服务", value: 4.2 },
    { name: "清洁能源", value: 2.4 },
    { name: "物流", value: -0.9 },
  ],
  GLOBAL: [
    { name: "数字基础设施", value: 2.7 },
    { name: "清洁能源", value: 2.1 },
    { name: "航运", value: -2.2 },
  ],
};

export const marketMovements: Readonly<
  Record<MarketView, readonly Readonly<{ at: string; text: string }>[]>
> = {
  CN: [
    { at: "13:42", text: "星港制造放量越过演示区间上沿" },
    { at: "11:18", text: "澄明消费跌幅扩大至 2% 以上" },
  ],
  HK: [
    { at: "15:26", text: "全球航运触及样本日内低位" },
    { at: "14:03", text: "香江科技热度升至市场前三" },
  ],
  US: [
    { at: "10:14", text: "纳斯达克云服务涨幅超过 5%" },
    { at: "09:51", text: "北美稳健出现样本波动提醒" },
  ],
  GLOBAL: [
    { at: "15:26", text: "全球航运领跌样本观察池" },
    { at: "10:14", text: "全球成长方向热度继续抬升" },
  ],
};

