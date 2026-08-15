import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 按需取任意 A 股代码的真实行情。
 *
 * 此前站内的真实行情来自一份预生成快照，只有 8 个标的（5 个指数 + 3 只个股）。
 * 于是任何一只没被预先列入的股票——比如需求截图里的蓝盾光电 300862——都
 * 没有真数据可用。这里改成按代码现取。
 *
 * 两个免费公开接口（均已实测可用）：
 *   行情快照 https://hq.sinajs.cn/list=<symbol>   —— 名称、开盘、昨收、现价、
 *            最高最低、成交量额、五档买卖盘、时间。返回 GBK，需要解码。
 *   日线     money.finance.sina.com.cn 的 getKLineData —— 与既有抓取脚本同源。
 *
 * 失败一律返回 null，页面显示「拿不到」。绝不猜测、不补零、不回落到样本数据：
 * 一条编出来的价格比一片空白危险得多。
 */

const QUOTE_ORIGIN = "https://hq.sinajs.cn";
const KLINE_ORIGIN = "https://money.finance.sina.com.cn";
const KLINE_PATH = "/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

/** 沪深六位代码，带 sh/sz 前缀。别的形态一律不发请求。 */
const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;
const DAILY_SCALE = 240;
const DEFAULT_BAR_COUNT = 180;

/*
 * 缓存时长。
 *
 * 行情按分钟变，日线一天只多一根。分开设：报价短、日线长。
 * 这一层同时是对上游的礼貌——同一个代码被反复打开时不会每次都去打人家接口。
 */
const QUOTE_TTL_MS = 60_000;
const BARS_TTL_MS = 6 * 60 * 60 * 1000;

export type QuoteBar = Readonly<{
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volume: number;
}>;

/*
 * 盘口的一档。
 *
 * 价为 0 表示这一档没有挂单（停牌、或档位不足），记成 null——
 * 显示成「0.00 元」会让人以为有人在零价挂单。
 */
export type OrderBookLevel = Readonly<{
  price: number | null;
  volume: number | null;
}>;

export type InstrumentQuote = Readonly<{
  amount: number;
  /** 卖一到卖五，价格递增。 */
  asks: readonly OrderBookLevel[];
  /** 买一到买五，价格递减。 */
  bids: readonly OrderBookLevel[];
  high: number;
  last: number;
  low: number;
  open: number;
  prevClose: number;
  tradedAt: string;
  volume: number;
}>;

export type InstrumentSnapshot = Readonly<{
  bars: readonly QuoteBar[];
  fetchedAt: string;
  name: string;
  quote: InstrumentQuote | null;
  symbol: string;
}>;

const cacheDirectory = (): string =>
  process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
  resolve(process.cwd(), ".runtime/finance/instruments");

const cachePath = (symbol: string): string =>
  resolve(cacheDirectory(), `${symbol}.json`);

const readCache = (symbol: string): InstrumentSnapshot | null => {
  try {
    return JSON.parse(
      readFileSync(cachePath(symbol), "utf8"),
    ) as InstrumentSnapshot;
  } catch {
    return null;
  }
};

const writeCache = (snapshot: InstrumentSnapshot): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = cachePath(snapshot.symbol);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果，下次重新取即可。
  }
};

const isFresh = (iso: string, ttlMs: number): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp < ttlMs;
};

/** 带超时与大小上限的取字节；返回 null 表示这次没拿到。 */
const fetchBytes = async (
  url: string,
  headers: Record<string, string>,
): Promise<Buffer | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // 上游异常返回一个巨大响应时不把它读进内存。
    return buffer.byteLength > MAX_BYTES ? null : buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const positive = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const nonNegative = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/*
 * 解析 hq_str 行情串。
 *
 * 字段顺序是新浪的既定格式：名称、今开、昨收、现价、最高、最低、买一、卖一、
 * 成交量(股)、成交额(元)、五档买卖各十项、日期、时间、状态。
 *
 * 停牌或尚未开盘时现价会是 0，这时只给名称不给报价——把 0 当价格显示出去，
 * 页面上就会出现一只「跌到零」的股票。
 */
/*
 * 五档盘口。
 *
 * 字段排列是拿真实报价串看出来的，不是猜的：
 *   [10..19] 买一到买五，[20..29] 卖一到卖五，都按「先量后价」交替。
 * 买价递减、卖价递增，现价正好落在买一与卖一之间。
 *
 * 买卖两侧弄反的话，页面上的盘口会把买盘画成卖盘——每个数字都是真的，
 * 只是站错了边，而肉眼完全看不出来。
 */
const parseLevels = (
  fields: readonly string[],
  start: number,
): readonly OrderBookLevel[] =>
  Array.from({ length: 5 }, (_, index) => {
    const offset = start + index * 2;
    return {
      price: positive(fields[offset + 1]),
      volume: nonNegative(fields[offset]),
    };
  });

const parseQuote = (
  fields: readonly string[],
): { name: string; quote: InstrumentQuote | null } | null => {
  const name = fields[0]?.trim() ?? "";
  if (name.length === 0) return null;

  const date = fields[30] ?? "";
  const time = fields[31] ?? "";
  const last = positive(fields[3]);
  const prevClose = positive(fields[2]);
  if (last === null || prevClose === null || !DATE_PATTERN.test(date)) {
    return { name, quote: null };
  }

  const open = positive(fields[1]);
  const high = positive(fields[4]);
  const low = positive(fields[5]);
  const volume = nonNegative(fields[8]);
  const amount = nonNegative(fields[9]);
  if (open === null || high === null || low === null) {
    return { name, quote: null };
  }

  return {
    name,
    quote: {
      amount: amount ?? 0,
      asks: parseLevels(fields, 20),
      bids: parseLevels(fields, 10),
      high,
      last,
      low,
      open,
      prevClose,
      tradedAt: `${date}T${time}`,
      volume: volume ?? 0,
    },
  };
};

const parseBar = (raw: unknown): QuoteBar | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const date = typeof value.day === "string" ? value.day.slice(0, 10) : "";
  if (!DATE_PATTERN.test(date)) return null;

  const open = positive(String(value.open));
  const high = positive(String(value.high));
  const low = positive(String(value.low));
  const close = positive(String(value.close));
  const volume = nonNegative(String(value.volume));
  if (open === null || high === null || low === null || close === null) {
    return null;
  }

  /*
   * 逐根自洽校验，与既有抓取脚本同一套标准。
   * 最高价低于开收盘、最低价高于开收盘，都是坏数据，画出来的蜡烛是错的。
   */
  if (high < Math.max(open, close) || low > Math.min(open, close)) return null;
  if (high < low) return null;

  return { close, date, high, low, open, volume: volume ?? 0 };
};

const fetchQuote = async (
  symbol: string,
): Promise<{ name: string; quote: InstrumentQuote | null } | null> => {
  const buffer = await fetchBytes(`${QUOTE_ORIGIN}/list=${symbol}`, {
    // 新浪对这个接口校验来源，缺了会被拒。
    Referer: "https://finance.sina.com.cn",
  });
  if (buffer === null) return null;

  let text: string;
  try {
    // 返回的是 GBK，用 UTF-8 解会把中文名称变成乱码。
    text = new TextDecoder("gbk").decode(buffer);
  } catch {
    return null;
  }

  const match = /hq_str_\w+="([^"]*)"/u.exec(text);
  const payload = match?.[1] ?? "";
  if (payload.length === 0) return null;
  return parseQuote(payload.split(","));
};

const fetchBars = async (
  symbol: string,
  count: number,
): Promise<readonly QuoteBar[] | null> => {
  const url = `${KLINE_ORIGIN}${KLINE_PATH}?symbol=${symbol}&scale=${DAILY_SCALE}&ma=no&datalen=${count}`;
  const buffer = await fetchBytes(url, {});
  if (buffer === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const bars = parsed.map(parseBar);
  /*
   * 一根坏的就整条不要。
   *
   * 连续序列里挖一个洞，所有由它推导的数字都会错，而界面上完全看不出来。
   */
  return bars.some((bar) => bar === null)
    ? null
    : (bars as readonly QuoteBar[]);
};

/**
 * 取一只标的的真实行情；拿不到返回 null。
 *
 * 缓存新鲜就直接用；报价过期但日线还新鲜时只重取报价，不重复拉日线。
 */
export const loadInstrumentSnapshot = async (
  rawSymbol: string,
  barCount = DEFAULT_BAR_COUNT,
  /*
   * 跳过缓存读取（仍然写回）。
   *
   * 盘中实时那条路要用：报价缓存是 60 秒，而实时视图 30 秒问一次——
   * 一半的轮询会拿到缓存，于是价格和盘口在屏上一动不动，而旁边的成交
   * 明细在跳。两个数各自都「对」，凑在一起是矛盾的。
   *
   * 页面首屏渲染照旧走缓存：那是一次性的，没必要每次刷新都打上游。
   */
  skipCache = false,
): Promise<InstrumentSnapshot | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache(symbol);
  if (
    !skipCache &&
    cached !== null &&
    isFresh(cached.fetchedAt, QUOTE_TTL_MS)
  ) {
    return cached;
  }

  const barsFresh =
    cached !== null &&
    isFresh(cached.fetchedAt, BARS_TTL_MS) &&
    cached.bars.length > 0;

  const [quoteResult, barsResult] = await Promise.all([
    fetchQuote(symbol),
    barsFresh ? Promise.resolve(cached.bars) : fetchBars(symbol, barCount),
  ]);

  // 名称都拿不到，说明这个代码在上游不存在或接口不可用；退回旧缓存而不是空。
  if (quoteResult === null) return cached;

  const bars = barsResult ?? cached?.bars ?? [];
  const snapshot: InstrumentSnapshot = {
    bars,
    fetchedAt: new Date().toISOString(),
    name: quoteResult.name,
    quote: quoteResult.quote,
    symbol,
  };
  writeCache(snapshot);
  return snapshot;
};
