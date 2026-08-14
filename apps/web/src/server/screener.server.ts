import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 选股器。
 *
 * 来源：东方财富行情列表接口，免费、无需鉴权、已实测可用（全 A 股 5500+ 只）：
 *   https://push2.eastmoney.com/api/qt/clist/get?fid=<排序字段>&fs=<市场>&fields=...
 *
 * 两件事在这一层定死：
 *
 * 一、排序和分页交给服务端。
 *     只对当前这一页重排，得到的是「这 20 只里的顺序」，却会被读成
 *     「全市场换手率最高的 20 只」——那是一句假话。
 *
 * 二、上游用字符串 "-" 表示「这只股票没有这个值」（亏损股没有市盈率）。
 *     Number("-") 是 NaN，一路传下去会在页面上渲染成乱码，或者被当成 0——
 *     而「市盈率 0」看起来像一只极度便宜的股票，那是彻头彻尾的误导。
 */

/*
 * 主源与降级源。
 *
 * 有些网络环境到 push2 不通（本机实测连接直接失败），而 push2delay 通。
 * 早先主源一失败就静默回退到旧缓存，于是页面能连着几小时显示几小时前的
 * 存档，看起来却像是此刻的行情——数字是真的，时点是假的。
 *
 * 现在主源不通就改用延时源，并把「这是延时行情」如实标出来。
 * 两个源的参数与字段完全一致，实测可互换。
 */
const ORIGIN = "https://push2.eastmoney.com";
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/clist/get";

/** 一次要的字段，编号是上游的既定协议。 */
const FIELDS = "f2,f3,f5,f6,f8,f9,f12,f14,f20,f21,f23,f115";

export const PAGE_SIZE = 20;
/** 页码上限，页面用它夹住用户在地址栏里改出来的数字。 */
export const MAX_SCREENER_PAGE = 500;
/** 全 A 股 5500 余只，留出余量；再大就是有人在拿页码乱试。 */
const MAX_PAGE = MAX_SCREENER_PAGE;

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
/** 行情分钟级变动，缓存一分钟——既新鲜，也不至于反复打人家接口。 */
const TTL_MS = 60_000;

/*
 * 市场范围。表达式是上游的既定写法：
 *   m:0+t:6   深市主板     m:0+t:80  创业板
 *   m:1+t:2   沪市主板     m:1+t:23  科创板
 */
export const SCREENER_MARKETS = {
  all: { fs: "m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:6", label: "全部 A 股" },
  chinext: { fs: "m:0+t:80", label: "创业板" },
  main: { fs: "m:1+t:2,m:0+t:6", label: "沪深主板" },
  star: { fs: "m:1+t:23", label: "科创板" },
} as const;

export type ScreenerMarket = keyof typeof SCREENER_MARKETS;

/** 可排序的列。field 是上游的排序字段编号。 */
export const SCREENER_SORTS = {
  amount: { field: "f6", label: "成交额" },
  change: { field: "f3", label: "涨跌幅" },
  marketCap: { field: "f20", label: "总市值" },
  pb: { field: "f23", label: "市净率" },
  pe: { field: "f115", label: "市盈率 TTM" },
  turnover: { field: "f8", label: "换手率" },
} as const;

export type ScreenerSort = keyof typeof SCREENER_SORTS;

export type ScreenerRow = Readonly<{
  amount: number | null;
  changePercent: number | null;
  floatMarketCap: number | null;
  last: number | null;
  marketCap: number | null;
  name: string | null;
  pb: number | null;
  peDynamic: number | null;
  peTtm: number | null;
  /** 带市场前缀，站内标的页认这个形式。 */
  symbol: string;
  turnoverPercent: number | null;
  volume: number | null;
}>;

export type ScreenerResult = Readonly<{
  /** 升序时为 true；上游 po=0 是升序、po=1 是降序。 */
  ascending: boolean;
  /** 走了延时源。页面据此如实标注，而不是让人以为是实时行情。 */
  delayed: boolean;
  fetchedAt: string;
  market: ScreenerMarket;
  page: number;
  rows: readonly ScreenerRow[];
  sort: ScreenerSort;
  /** 上游没给就是 null——不拿本页行数冒充全市场规模。 */
  total: number | null;
}>;

export type ScreenerQuery = Readonly<{
  ascending?: boolean;
  market?: ScreenerMarket;
  page: number;
  sort?: ScreenerSort;
}>;

const cacheDirectory = (): string =>
  resolve(
    process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance/instruments"),
    "screener",
  );

/*
 * 缓存文件名带上完整查询。
 *
 * 所有查询共用一个文件的话，按换手率排的页面会直接拿按涨幅排的结果渲染——
 * 表头写着换手率，顺序却是涨幅的。
 */
const cacheName = (
  sort: ScreenerSort,
  market: ScreenerMarket,
  page: number,
  ascending: boolean,
): string =>
  `${sort}-${market}-p${page.toString()}-${ascending ? "asc" : "desc"}`;

const readCache = (name: string): ScreenerResult | null => {
  try {
    return JSON.parse(
      readFileSync(resolve(cacheDirectory(), `${name}.json`), "utf8"),
    ) as ScreenerResult;
  } catch {
    return null;
  }
};

const writeCache = (name: string, value: ScreenerResult): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = resolve(cacheDirectory(), `${name}.json`);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果。
  }
};

const isFresh = (iso: string): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp < TTL_MS;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > MAX_BYTES) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 上游的数值字段。
 *
 * 字符串 "-" 是「这只股票没有这个值」，不是 0——亏损股本来就没有市盈率。
 */
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/*
 * 上游只给六位代码，站内标的页认的是带市场前缀的形式。
 * 6 开头是沪市（60 主板、68 科创板），其余的（00/30）是深市。
 */
const withMarket = (code: string): string =>
  `${code.startsWith("6") ? "sh" : "sz"}${code}`;

/**
 * 取一页选股结果；拿不到返回 null。
 *
 * 页码不合法时不发请求——别拿地址栏里随手改的数字去打上游。
 */
export const loadScreener = async (
  query: ScreenerQuery,
): Promise<ScreenerResult | null> => {
  const { page } = query;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;

  const sort = query.sort ?? "change";
  const market = query.market ?? "all";
  const ascending = query.ascending ?? false;

  const name = cacheName(sort, market, page, ascending);
  const cached = readCache(name);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const parameters = new URLSearchParams({
    fid: SCREENER_SORTS[sort].field,
    fields: FIELDS,
    fltt: "2",
    fs: SCREENER_MARKETS[market].fs,
    invt: "2",
    np: "1",
    pn: String(page),
    // po=1 是降序、po=0 是升序，这是上游的既定含义。
    po: ascending ? "0" : "1",
    pz: String(PAGE_SIZE),
  });
  /*
   * 主源不通就改用延时源，而不是直接回退到旧缓存。
   * 一份晚十几分钟的真行情，比一份几小时前的存档有用得多。
   */
  let delayed = false;
  let payload = await fetchJson(`${ORIGIN}${PATH}?${parameters.toString()}`);
  if (payload === null) {
    payload = await fetchJson(
      `${DELAYED_ORIGIN}${PATH}?${parameters.toString()}`,
    );
    delayed = true;
  }
  if (typeof payload !== "object" || payload === null) return cached;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return cached;
  const body = data as Record<string, unknown>;

  const diff = Array.isArray(body.diff) ? body.diff : [];
  const rows = diff.flatMap((entry): readonly ScreenerRow[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const code = text(row.f12);
    // 没有代码就构造不出链接，这一行点不进去，留着只是噪声。
    if (code === null) return [];
    return [
      {
        amount: numeric(row.f6),
        changePercent: numeric(row.f3),
        floatMarketCap: numeric(row.f21),
        last: numeric(row.f2),
        marketCap: numeric(row.f20),
        name: text(row.f14),
        pb: numeric(row.f23),
        peDynamic: numeric(row.f9),
        peTtm: numeric(row.f115),
        symbol: withMarket(code),
        turnoverPercent: numeric(row.f8),
        volume: numeric(row.f5),
      },
    ];
  });

  const result: ScreenerResult = {
    ascending,
    delayed,
    fetchedAt: new Date().toISOString(),
    market,
    page,
    rows,
    sort,
    /*
     * 上游没给 total 就承认不知道，不拿本页行数顶替——
     * 那会让页面显示「第 1/1 页 · 共 20 只」，把一个编出来的
     * 全市场规模写在用户眼前。
     */
    total: numeric(body.total),
  };
  writeCache(name, result);
  return result;
};
