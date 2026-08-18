import { request, type ApiResult } from "./request";

/*
 * 行情接口。
 *
 * 和网页版同一批路由（apps/web/src/app/api/market/*），数据来自公开行情源。
 * 这些数字会被人拿去做判断，所以宁可如实说取不到，也不要拿上一次的值
 * 冒充当前值。
 */

export type IndexQuote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string;
  symbol: string;
}>;

export type Breadth = Readonly<{
  advancing: number;
  declining: number;
  unchanged: number;
}>;

export type Sector = Readonly<{
  advancing: number;
  changePercent: number | null;
  code: string;
  declining: number;
  /** 领涨股的站内地址。上游没给、或站内渲染不出来时为 null。 */
  leaderHref: string | null;
  leaderName: string | null;
  name: string;
}>;

export type MarketOverview = Readonly<{
  /** 上游没给涨跌家数时为 null——那不是「零家上涨」。 */
  breadth: Breadth | null;
  concepts: readonly Sector[];
  /** 上游是延时行情。界面上要标出来，不能让人当成逐笔实时。 */
  delayed: boolean;
  indexes: readonly IndexQuote[];
  industries: readonly Sector[];
}>;

/*
 * 自选列表里的一行行情。
 *
 * 除代码外全部可空，和服务端 ListQuote 一字不差：停牌、退市、上游临时缺这一
 * 只，回的都是 null。此前这里写的是「一定有」，于是自选里只要混进一只停牌的
 * 票，列表就在 last.toFixed() 上整屏红。
 */
export type Quote = Readonly<{
  changeAmount: number | null;
  changePercent: number | null;
  last: number | null;
  name: string | null;
  symbol: string;
  /** Unix 秒。上游给的就是这个粒度。 */
  tradedAtSeconds: number | null;
}>;

export type Portfolio = Readonly<{
  holdings?: readonly Readonly<{ symbol: string; weight: number }>[];
  id: string;
  name: string;
}>;

export type PortfolioSets = Readonly<{
  created: readonly Portfolio[];
  followed: readonly Portfolio[];
}>;

export const fetchMarketOverview = async (): Promise<
  ApiResult<MarketOverview>
> =>
  request<MarketOverview>("/api/market/overview", {
    method: "GET",
    token: null,
  });

export const fetchQuotes = async (
  symbols: readonly string[],
): Promise<ApiResult<readonly Quote[]>> => {
  /*
   * 空列表不发请求。
   *
   * 拼一个空的 ?symbols= 打过去，服务端会正确地回空数组——但那是一次白跑的
   * 往返，而「自选是空的」恰恰是新用户最常处于的状态，等于每次进这一页都
   * 先卡一下网络，才告诉他一句「还没有自选」。
   */
  if (symbols.length === 0) return { kind: "ok", value: [] };

  const query = encodeURIComponent(symbols.join(","));
  const result = await request<Readonly<{ quotes?: readonly Quote[] }>>(
    `/api/market/quotes?symbols=${query}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.quotes ?? [] };
};

/*
 * 组合榜：站内账号真实建过的全部组合。
 *
 * 不需要登录——榜本来就是给所有人看的。收益不在服务端算：那样一次页面加载会
 * 变成几十次上游请求，所以这一侧把所有持仓的代码凑齐，一次问完行情再自己算。
 */
export type PublicPortfolio = Portfolio &
  Readonly<{ followerCount: number; ownerName: string }>;

export const fetchPublicPortfolios = async (): Promise<
  ApiResult<readonly PublicPortfolio[]>
> => {
  const result = await request<
    Readonly<{ portfolios?: readonly PublicPortfolio[] }>
  >("/api/social/portfolios/public", { method: "GET", token: null });
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.portfolios ?? [] };
};

/* followed 是「操作之后应处于的状态」，不是「当前状态」。 */
export const setPortfolioFollowed = async (
  token: string,
  portfolioId: string,
  followed: boolean,
): Promise<ApiResult<PortfolioSets>> =>
  request<PortfolioSets>("/api/social/portfolios", {
    body: { followed, portfolio: portfolioId },
    method: "POST",
    token,
  });

export const createPortfolio = async (
  token: string,
  name: string,
  summary: string,
  holdings: readonly Readonly<{ symbol: string; weight: number }>[],
): Promise<ApiResult<unknown>> =>
  request("/api/social/portfolios", {
    body: { holdings, name, summary },
    method: "POST",
    token,
  });

export const fetchPortfolios = async (
  token: string,
): Promise<ApiResult<PortfolioSets>> =>
  request<PortfolioSets>("/api/social/portfolios", { method: "GET", token });

/*
 * 基金与私募都复用网页版现成的接口，不另建一套。
 *
 * 分类与排序的取值来自服务端 fund-list.server.ts 的 CATEGORY_FILTERS / SORT_KEYS，
 * 传错会被整体拒绝并回「分类或排序不正确」——所以这里用联合类型钉住，
 * 而不是让调用方传裸字符串。
 */
export type FundCategory = "bond" | "hybrid" | "index" | "qdii" | "stock";
export type FundSort = "day" | "oneYear" | "threeYear" | "yearToDate";

/*
 * 可空的字段照服务端来。
 *
 * 这里一度把它们声明成非空，而服务端给的是 number | null——新基金还没披露净值、
 * 场外品种没有涨跌幅时就是 null。类型撒了谎，界面上 .toFixed() 直接红屏，
 * 而复现条件是「某一天恰好有这样一只」。
 */
export type FundRow = Readonly<{
  category: string;
  code: string;
  dayPct: number | null;
  name: string;
  nav: number | null;
  /** YYYY-MM-DD。净值是按日披露的，没有比日更细的粒度。 */
  navDate: string;
  oneYearPct: number | null;
}>;

export type PrivateFundManager = Readonly<{
  /** 中基协公示页地址。私募这类信息必须能追回原始出处。 */
  disclosureUrl: string;
  /** YYYY-MM-DD。 */
  establishedOn: string;
  fundCount: number;
  investType: string;
  legalPerson: string;
  name: string;
}>;

export const fetchFundList = async (
  category: FundCategory,
  sort: FundSort,
): Promise<ApiResult<readonly FundRow[]>> => {
  const result = await request<Readonly<{ rows?: readonly FundRow[] }>>(
    `/api/funds/list?category=${category}&sort=${sort}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.rows ?? [] };
};

export const fetchPrivateFundManagers = async (): Promise<
  ApiResult<readonly PrivateFundManager[]>
> => {
  const result = await request<
    Readonly<{ managers?: readonly PrivateFundManager[] }>
  >("/api/private-funds", { method: "GET", token: null });
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.managers ?? [] };
};

type WatchlistResponse = Readonly<{ symbols?: readonly string[] }>;

const readSymbols = (
  result: ApiResult<WatchlistResponse>,
): ApiResult<readonly string[]> =>
  result.kind === "ok"
    ? { kind: "ok", value: result.value.symbols ?? [] }
    : result;

/*
 * 自选存在服务端，不是手机本地。
 *
 * 存本地的话，手机上加的自选网页上看不到，反过来也一样——而自选恰恰是最该
 * 跟着人走的东西。这两个接口和网页版调的是同一个。
 */
export const fetchWatchlist = async (
  token: string,
): Promise<ApiResult<readonly string[]>> =>
  readSymbols(
    await request<WatchlistResponse>("/api/social/watchlist", {
      method: "GET",
      token,
    }),
  );

/* watchlisted 是「操作之后应处于的状态」，不是「当前状态」。 */
export const setWatchlisted = async (
  token: string,
  symbol: string,
  watchlisted: boolean,
): Promise<ApiResult<readonly string[]>> =>
  readSymbols(
    await request<WatchlistResponse>("/api/social/watchlist", {
      body: { symbol, watchlisted },
      method: "POST",
      token,
    }),
  );

/*
 * 热股榜、7x24 快讯、视频。
 *
 * 首页的热门与视频两个频道要用。都复用网页版现成的路由，没有另建。
 */

export type HotRow = Readonly<{
  changePercent: number | null;
  code: string;
  /** 站内个股页地址，形如 /instruments/sz300314；暂无详情页的市场为 null。 */
  href: string | null;
  last: number | null;
  name: string;
}>;

export const fetchHotBoard = async (
  direction: "gainers" | "losers" = "gainers",
): Promise<ApiResult<readonly HotRow[]>> => {
  const result = await request<Readonly<{ rows?: readonly HotRow[] }>>(
    `/api/market/hot?market=cn&direction=${direction}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.rows ?? [] };
};

/*
 * 标的搜索。
 *
 * symbol / href 可能是 null：上游的代码表里有一些站内渲染不出来的品种。为空
 * 时不给跳转，也不给「加自选」——照样列出来是对的，用户至少知道有这只；
 * 但按钮点下去打不开，比不给按钮更糟。
 */
export type SearchHit = Readonly<{
  code: string;
  href: string | null;
  /** 上游给的分类名，例如「沪A」「深A」「ETF」。 */
  kind: string;
  name: string;
  symbol: string | null;
}>;

export const searchInstruments = async (
  query: string,
): Promise<ApiResult<readonly SearchHit[]>> => {
  const result = await request<Readonly<{ hits?: readonly SearchHit[] }>>(
    `/api/market/search?q=${encodeURIComponent(query)}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.hits ?? [] };
};

/*
 * ETF 列表。
 *
 * 首页的 ETF 频道拿它当名单用：帖子里引用到的代码在不在这张表里，决定它算不算
 * ETF 相关。按号段猜（51 开头就是 ETF）会分出一份看着像、实则错的东西。
 */
export type EtfRow = Readonly<{
  changePercent: number | null;
  code: string;
  href: string | null;
  last: number | null;
  name: string;
}>;

export const fetchEtfList = async (): Promise<ApiResult<readonly EtfRow[]>> => {
  const result = await request<Readonly<{ rows?: readonly EtfRow[] }>>(
    "/api/market/etfs?sort=amount&page=1",
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.rows ?? [] };
};

export type NewsItem = Readonly<{
  digest: string;
  href: string;
  id: string;
  /** 上游给的是 "YYYY-MM-DD HH:mm"，不是 ISO；照原样带着，不自作主张改格式。 */
  publishedAt: string;
  title: string;
}>;

export const fetchLiveNews = async (): Promise<
  ApiResult<readonly NewsItem[]>
> => {
  const result = await request<Readonly<{ items?: readonly NewsItem[] }>>(
    "/api/live-news",
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.items ?? [] };
};

export type VideoItem = Readonly<{
  code: string;
  column: string;
  href: string;
  /** "YYYY-MM-DD HH:mm"。 */
  publishedAt: string;
  /** 封面文件名，喂给 /api/videos/thumbnail；上游没给时为 null。 */
  thumbnail: string | null;
  title: string;
}>;

export const fetchVideos = async (): Promise<
  ApiResult<readonly VideoItem[]>
> => {
  const result = await request<Readonly<{ videos?: readonly VideoItem[] }>>(
    "/api/videos",
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.videos ?? [] };
};

/*
 * 个股页。
 *
 * 参考图（instrument-*.png）里个股页有五个子页：分时/K线、讨论、成分股、
 * 资讯、相关ETF，以及八档周期切换。这些路由网页版都有，全部复用。
 */

/** 与服务端 chart-series.server.ts 的 ChartPeriod 一致，传错会被整体拒绝。 */
export type ChartPeriod =
  | "5day"
  | "day"
  | "intraday"
  | "m1"
  | "m5"
  | "m15"
  | "m30"
  | "m60"
  | "m120"
  | "month"
  | "quarter"
  | "week"
  | "year";

export type ChartBar = Readonly<{
  close: number;
  /** YYYY-MM-DD。 */
  date: string;
  high: number;
  low: number;
  open: number;
  volumeShares: number;
}>;

export type ChartPoint = Readonly<{
  averagePrice: number;
  price: number;
  /** HH:mm，当天的分时刻度。 */
  time: string;
  volumeShares: number;
}>;

/*
 * 两种图形状不同：分时是一条线，其余是蜡烛。
 *
 * 合成一个「都有 bars」的形状会逼着分时假装自己有开高低收——那四个数在分时里
 * 根本不存在，编出来的值会被人当真。
 */
export type ChartSeries =
  | Readonly<{ bars: readonly ChartBar[]; kind: "candle"; period: string }>
  | Readonly<{ kind: "line"; period: string; points: readonly ChartPoint[] }>;

export const fetchChart = async (
  symbol: string,
  period: ChartPeriod,
): Promise<ApiResult<ChartSeries>> =>
  request<ChartSeries>(
    `/api/market/chart?symbol=${encodeURIComponent(symbol)}&period=${period}`,
    { method: "GET", token: null },
  );

/*
 * 下面这三块照抄服务端 /api/market/instrument-live 的回包，字段名一个不改。
 *
 * 此前这里是照着想象写的：说名称、涨跌额、涨跌幅、昨收在 quote 里。服务端把
 * 前三样放在 metrics 里，昨收在 quote 里叫 prevClose。回包是 JSON.parse 出来
 * 的，编译器管不着，于是这个谎一直到 quote.changeAmount.toFixed() 那一刻才
 * 兑现成一整屏红。
 *
 * 对齐字段名没有讨价还价的余地：想改名就得在服务端改，让编译器两边都看得见。
 */

/** 盘口一档。停牌或档位不足时价量为 null——不是零价零量。 */
export type OrderBookLevel = Readonly<{
  price: number | null;
  volume: number | null;
}>;

/** 服务端回包里的 quote：撮合出来的那一组数，加上五档。 */
export type InstrumentTicker = Readonly<{
  amount: number;
  /** 卖一到卖五，价格递增。 */
  asks: readonly OrderBookLevel[];
  /** 买一到买五，价格递减。 */
  bids: readonly OrderBookLevel[];
  high: number;
  last: number;
  low: number;
  open: number;
  /** 服务端就叫这个名字，不是 previousClose。 */
  prevClose: number;
  tradedAt: string;
  volume: number;
}>;

/*
 * 服务端回包里的 metrics：名称、涨跌，以及报价头第二行往后的所有指标。
 *
 * 除名称与代码外全部可空——上游对停牌、次新、场外品种给的就是空值。把空当
 * 零，页面上会印出一个「0.00%」，读起来是「今天没动」，而事实是「不知道」。
 */
export type InstrumentMetrics = Readonly<{
  amount: number | null;
  amplitudePercent: number | null;
  bookValuePerShare: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  earningsPerShare: number | null;
  floatMarketCap: number | null;
  floatShares: number | null;
  high: number | null;
  last: number | null;
  limitDown: number | null;
  limitUp: number | null;
  low: number | null;
  name: string;
  open: number | null;
  orderRatioPercent: number | null;
  peDynamic: number | null;
  peStatic: number | null;
  peTtm: number | null;
  previousClose: number | null;
  priceToBook: number | null;
  symbol: string;
  totalMarketCap: number | null;
  totalShares: number | null;
  tradedAtSeconds: number | null;
  turnoverPercent: number | null;
  volumeRatio: number | null;
  /** 成交股数。服务端已经把「手」换成「股」。 */
  volumeShares: number | null;
  week52High: number | null;
  week52Low: number | null;
}>;

export type TickSide = "buy" | "neutral" | "sell";

export type Tick = Readonly<{
  price: number;
  side: TickSide;
  /** HH:mm:ss。 */
  time: string;
  volumeShares: number;
}>;

export type TickTape = Readonly<{
  previousClose: number | null;
  symbol: string;
  /** 最近的在最前面。 */
  ticks: readonly Tick[];
}>;

/*
 * 三块各自可空。
 *
 * 服务端是三路并发取的，一路超时就少一块，只有三块全空才回 502。少一块时
 * 页面保持那一块原样，不清空整屏——所以这里必须是 null 而不是「一定有」。
 */
export type InstrumentLive = Readonly<{
  metrics: InstrumentMetrics | null;
  quote: InstrumentTicker | null;
  tape: TickTape | null;
}>;

export const fetchInstrumentLive = async (
  symbol: string,
): Promise<ApiResult<InstrumentLive>> =>
  request<InstrumentLive>(
    `/api/market/instrument-live?symbol=${encodeURIComponent(symbol)}`,
    { method: "GET", token: null },
  );

/*
 * 一只标的的公告。
 *
 * 此前这里的形状是照着「全市场公告流」写的（带 code 和 name），因为这条路由
 * 当时只有全市场那一支——`symbol` 传了也不看，个股页的公告页签里印的其实是
 * 当天全市场最新几条，别人家的公告。
 *
 * 现在服务端按标的查，回包里就不再有公司名了：这一页本来就是这家公司的，
 * 每一行再写一遍名字是废话。类目（定期报告 / 临时公告）比名字有用。
 */
export type Announcement = Readonly<{
  /** 「定期报告」一类的类目；上游没给时为 null。 */
  category: string | null;
  href: string;
  /** YYYY-MM-DD；上游没给时为 null。 */
  publishedOn: string | null;
  /** 上游偶尔给空标题；那一行没法读，界面上不列。 */
  title: string | null;
}>;

export const fetchAnnouncements = async (
  symbol: string,
): Promise<ApiResult<readonly Announcement[]>> => {
  const result = await request<Readonly<{ rows?: readonly Announcement[] }>>(
    `/api/market/announcements?symbol=${encodeURIComponent(symbol)}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.rows ?? [] };
};

/*
 * 券商研报。
 *
 * 这里原来是 fetchRelatedEtfs(symbol)——它把 symbol 拼进 /api/market/etfs，
 * 而那条接口只认排序和翻页，`symbol` 收下了从不看。于是每只股票的「ETF」
 * 那一档列的都是同一份按成交额排的全市场 ETF：参数是假的，函数名也是假的
 * （Related 从来没有实现过），而每一行都是真 ETF，看不出破绽。
 *
 * 研报是真按代码查的。
 */
export type ResearchReport = Readonly<{
  /** 研报正文页。 */
  href: string;
  /** 券商简称；上游没给时为 null。 */
  institution: string | null;
  /** YYYY-MM-DD。 */
  publishedOn: string | null;
  /** 「买入」「增持」一类的评级。 */
  rating: string | null;
  /** 元/股。这是**该券商的**目标价，不是市场共识——界面上必须写清是谁给的。 */
  targetPrice: number | null;
  thisYearEps: number | null;
  title: string | null;
}>;

export const fetchResearchReports = async (
  symbol: string,
): Promise<ApiResult<readonly ResearchReport[]>> => {
  const result = await request<
    Readonly<{ reports?: readonly ResearchReport[] }>
  >(`/api/market/research?symbol=${encodeURIComponent(symbol)}`, {
    method: "GET",
    token: null,
  });
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.reports ?? [] };
};
