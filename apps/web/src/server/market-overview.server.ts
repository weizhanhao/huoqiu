/*
 * 行情中心的概览数据：主要指数、涨跌家数、行业与概念板块。
 *
 * 行情页此前整页都是样本——「恒生样本指数」「全球航运」「星港制造」，
 * 点数、涨跌幅、概念热度全是写死的常量。站内最该是真数据的一页，
 * 反倒一个真数字都没有。
 *
 * 三份数据都来自东方财富的公开接口。
 *
 * 这里原本写着一段「5283 + 北交所约 266 = 5549」的交叉验证——那个算术是
 * 错的，我把它记在这里以免有人照抄：北交所实为 346 只，而 5549 本来就是
 * 沪深 A 股筛选串自己返回的 total，跟涨跌家数没有关系。
 *
 * 涨跌家数的真实口径是：上证指数与深证成指两个指数的成分合计，
 * 含 B 股，且**只统计当日有成交的**——停牌的既不算涨也不算跌，直接不在里面。
 * 所以三个数相加得到的是「今天动过的股票数」，不是市场规模（沪深实际
 * 上市 5663 只）。页面上必须照这个口径写，不能写成「共 N 只」。
 *
 * 盘口异动不在这份里，它自己取自己刷（market-changes.server.ts）：概览
 * 十分钟取一次就够，异动停十分钟就没用了。我一度断言那个接口「返回 rc:102
 * 拒绝服务」——那是错的，缺的只是 dpt 参数。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 有些网络环境到 push2 不通，延时源仍可用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const QUOTE_PATH = "/api/qt/ulist.np/get";
const LIST_PATH = "/api/qt/clist/get";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;

/*
 * 涨跌家数按指数取。
 *
 * 上证指数覆盖沪市全部上市证券、深证成指覆盖深市全部，两者相加即沪深两市。
 * 不含北交所：上游没有对应的指数口径，与其估一个，不如在页面上写明范围。
 *
 * 两点要在页面上如实说明：这里含 B 股；停牌的股票不在任何一档里，
 * 因此三个数之和是「今天有成交的只数」，不是市场规模。
 */
const BREADTH_INDEXES = ["1.000001", "0.399001"] as const;

/** 板块列表取前几名（上游一页最多 100 条，实测 pz=500 会被截）。 */
const SECTOR_ROWS = 12;

/** 板块的筛选串：t:2 是行业，t:3 是概念。 */
const SECTOR_FILTERS = {
  concept: "m:90+t:3",
  industry: "m:90+t:2",
} as const;

export type SectorKind = keyof typeof SECTOR_FILTERS;

export type IndexQuote = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string;
  symbol: string;
}>;

export type MarketBreadth = Readonly<{
  advancing: number;
  declining: number;
  /** 平盘。涨跌之外的那一部分，不能省——省了三个数就凑不成全部。 */
  unchanged: number;
}>;

export type Sector = Readonly<{
  /** 板块内上涨家数。 */
  advancing: number;
  changePercent: number | null;
  code: string;
  /** 板块内下跌家数。 */
  declining: number;
  /** 领涨股。上游没给、或站内渲染不出来时为 null。 */
  leaderHref: string | null;
  leaderName: string | null;
  name: string;
}>;

export type MarketOverview = Readonly<{
  breadth: MarketBreadth | null;
  concepts: readonly Sector[];
  /** 走的是延时源时为 true，页面据此如实标注。 */
  delayed: boolean;
  indexes: readonly IndexQuote[];
  industries: readonly Sector[];
}>;

/** 站内标的页认得的沪深指数。 */
const INDEX_SYMBOLS = [
  { code: "000001", name: "上证指数", secid: "1.000001", symbol: "sh000001" },
  { code: "399001", name: "深证成指", secid: "0.399001", symbol: "sz399001" },
  { code: "399006", name: "创业板指", secid: "0.399006", symbol: "sz399006" },
  { code: "000688", name: "科创 50", secid: "1.000688", symbol: "sh000688" },
  { code: "000300", name: "沪深 300", secid: "1.000300", symbol: "sh000300" },
  { code: "000905", name: "中证 500", secid: "1.000905", symbol: "sh000905" },
] as const;

const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // "-" 是「这一项没有这个值」，不是 0。
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** 家数缺失时按 0 计。这是计数，不是价格——没有就是没有那么多家。 */
const count = (value: unknown): number => numeric(value) ?? 0;

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (reader === undefined) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    // 上游限流时回的是空响应体，JSON.parse 会抛。
    if (body.trim().length === 0) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/*
 * 上游的 diff 有两种形状：有时是数组，有时是以 "0"、"1" 为键的对象。
 * 只处理数组的话，返回对象的那些请求会得到一份空列表——
 * 而页面上看起来就像今天没有板块在涨跌。
 */
export const rowsOf = (
  payload: unknown,
): readonly Record<string, unknown>[] => {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return [];
  const diff = (data as Record<string, unknown>).diff;
  const raw = Array.isArray(diff)
    ? diff
    : typeof diff === "object" && diff !== null
      ? Object.values(diff as Record<string, unknown>)
      : [];
  return raw.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
  );
};

/**
 * 板块的领涨股链接。
 *
 * 上游给的是六位代码，不带市场前缀。按号段补：60/68 是沪市，00/30 是深市。
 * 补错会把人送到另一只完全不同的股票上，而地址栏看起来一切正常；
 * 北交所等号段站内渲染不出来，同样不给——先许诺点得进去、再给一张空页，
 * 比不给链接更糟。
 */
export const leaderHrefOf = (code: unknown): string | null => {
  if (typeof code !== "string" || !/^\d{6}$/u.test(code)) return null;
  if (/^(60|68)/u.test(code)) return `/instruments/sh${code}`;
  if (/^(00|30)/u.test(code)) return `/instruments/sz${code}`;
  return null;
};

const toSector = (row: Record<string, unknown>): Sector | null => {
  const code = typeof row.f12 === "string" ? row.f12 : "";
  const name = typeof row.f14 === "string" ? row.f14 : "";
  if (code.length === 0 || name.length === 0) return null;
  return {
    advancing: count(row.f104),
    changePercent: numeric(row.f3),
    code,
    declining: count(row.f105),
    leaderHref: leaderHrefOf(row.f140),
    leaderName:
      typeof row.f128 === "string" && row.f128.length > 0 ? row.f128 : null,
    name,
  };
};

/**
 * 行情中心的一整屏；四份数据一次取齐。
 *
 * 任何一份取不到都只让那一块为空，不让整页失败——指数取不到不该连带
 * 把板块也藏起来。四份全空时返回 null，页面据此说「取不到」。
 */
export const loadMarketOverview = async (): Promise<MarketOverview | null> => {
  const quoteQuery = new URLSearchParams({
    fields: "f2,f3,f12,f14",
    // 不带这个参数，上游回的是整数编码，点数会差一百倍。
    fltt: "2",
    secids: INDEX_SYMBOLS.map((entry) => entry.secid).join(","),
  });
  const breadthQuery = new URLSearchParams({
    fields: "f12,f14,f104,f105,f106",
    fltt: "2",
    secids: BREADTH_INDEXES.join(","),
  });
  const sectorQuery = (kind: SectorKind): URLSearchParams =>
    new URLSearchParams({
      fid: "f3",
      fields: "f3,f12,f14,f104,f105,f128,f140",
      fs: SECTOR_FILTERS[kind],
      fltt: "2",
      pn: "1",
      po: "1",
      pz: String(SECTOR_ROWS),
    });

  let delayed = false;
  const get = async (
    path: string,
    query: URLSearchParams,
  ): Promise<unknown> => {
    const primary = await fetchJson(`${ORIGIN}${path}?${query.toString()}`);
    if (primary !== null) return primary;
    delayed = true;
    return fetchJson(`${DELAYED_ORIGIN}${path}?${query.toString()}`);
  };

  const [quotePayload, breadthPayload, industryPayload, conceptPayload] =
    await Promise.all([
      get(QUOTE_PATH, quoteQuery),
      get(QUOTE_PATH, breadthQuery),
      get(LIST_PATH, sectorQuery("industry")),
      get(LIST_PATH, sectorQuery("concept")),
    ]);

  /*
   * 指数按代码回填名字与顺序。
   * 直接用上游返回的顺序会让「主要指数」那一排每次刷新都换位置。
   */
  const byCode = new Map(
    rowsOf(quotePayload).map((row) => [String(row.f12 ?? ""), row]),
  );
  const indexes: IndexQuote[] = [];
  for (const entry of INDEX_SYMBOLS) {
    const row = byCode.get(entry.code);
    if (row === undefined) continue;
    indexes.push({
      changePercent: numeric(row.f3),
      last: numeric(row.f2),
      // 名字用上游给的，取不到才回落到本地写的那个。
      name:
        typeof row.f14 === "string" && row.f14.length > 0
          ? row.f14
          : entry.name,
      symbol: entry.symbol,
    });
  }

  const breadthRows = rowsOf(breadthPayload);
  const breadth =
    breadthRows.length === 0
      ? null
      : {
          advancing: breadthRows.reduce(
            (total, row) => total + count(row.f104),
            0,
          ),
          declining: breadthRows.reduce(
            (total, row) => total + count(row.f105),
            0,
          ),
          unchanged: breadthRows.reduce(
            (total, row) => total + count(row.f106),
            0,
          ),
        };

  const industries = rowsOf(industryPayload)
    .map((row) => toSector(row))
    .filter((sector): sector is Sector => sector !== null);
  const concepts = rowsOf(conceptPayload)
    .map((row) => toSector(row))
    .filter((sector): sector is Sector => sector !== null);

  if (
    indexes.length === 0 &&
    breadth === null &&
    industries.length === 0 &&
    concepts.length === 0
  ) {
    return null;
  }

  return { breadth, concepts, delayed, indexes, industries };
};
