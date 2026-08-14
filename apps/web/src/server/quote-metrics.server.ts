/*
 * 行情页那一片指标。
 *
 * 个股页此前只有六个数字（今开/昨收/最高/最低/成交量/成交额），对着雪球
 * 那一片三十多格显得很空。数据一直都在——同一个报价接口返回 62 个非空字段，
 * 只是没人取。
 *
 * 字段号是照真实值一个一个对出来的，不是猜的：对照长鑫科技 688825 在
 * 2026-08-14 11:29 的实际页面，最高 55.38、涨停 63.46、换手 5.71%、
 * 委比 -89.27%、市盈率(静) 1960.56、总股本 668.81 亿……21 个精确命中。
 * 对错一个不会报错，只会在页面上多一个看着完全正常的错数。
 *
 * 有几项这里**没有**：股息(TTM)、股息率(TTM)、表决权、注册制、盈利情况、
 * 盘后量/额。这个接口里找不到能对上的字段，我不拿相近的顶上——一个错的
 * 股息率比没有股息率糟得多。
 *
 * 另起一个模块而不是塞进 market-quote.server.ts：那边是新浪源、只认沪深、
 * 产出带五档盘口的报价，两套上游的字段和口径都不一样，合在一起最后是
 * 两边都不敢动。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 有些网络环境到 push2 不通，延时源仍可用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/stock/get";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

/** 一手 100 股。上游成交量给的是手。 */
const SHARES_PER_LOT = 100;

const FIELDS = [
  "f43", // 现价
  "f44", // 最高
  "f45", // 最低
  "f46", // 今开
  "f47", // 成交量（手）
  "f48", // 成交额
  "f50", // 量比
  "f51", // 涨停
  "f52", // 跌停
  "f57", // 代码
  "f58", // 名称
  "f60", // 昨收
  "f84", // 总股本
  "f85", // 流通股
  "f86", // 时间戳（epoch 秒）
  "f116", // 总市值
  "f117", // 流通值
  "f162", // 市盈率（动）
  "f163", // 市盈率（静）
  "f164", // 市盈率（TTM）
  "f167", // 市净率
  "f168", // 换手率 %
  "f169", // 涨跌额
  "f170", // 涨跌幅 %
  "f171", // 振幅 %
  "f174", // 52 周最高
  "f175", // 52 周最低
  "f191", // 委比 %
].join(",");

export type QuoteMetrics = Readonly<{
  amount: number | null;
  amplitudePercent: number | null;
  /** 现价 ÷ 市净率。 */
  bookValuePerShare: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  /** 现价 ÷ 市盈率（TTM）。 */
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
  /** 成交股数。上游给的是手，这里换成股。 */
  volumeShares: number | null;
  week52High: number | null;
  week52Low: number | null;
}>;

/*
 * 站内代码 → 上游 secid。
 *
 * 美股的交易所看代码分不出来（105 纳斯达克、106 纽交所、107 美交所），
 * 三个依次试；港股是 116，代码补到五位。
 */
const secidsOf = (symbol: string): readonly string[] => {
  const code = symbol.slice(2);
  if (symbol.startsWith("hk")) {
    return /^\d{1,5}$/u.test(code) ? [`116.${code.padStart(5, "0")}`] : [];
  }
  if (symbol.startsWith("us")) {
    if (!/^[a-z][a-z0-9_]{0,9}$/u.test(code)) return [];
    const ticker = code.toUpperCase();
    return [`105.${ticker}`, `106.${ticker}`, `107.${ticker}`];
  }
  if (!/^(?:sh|sz)\d{6}$/u.test(symbol)) return [];
  return [`${symbol.startsWith("sh") ? "1" : "0"}.${code}`];
};

/*
 * 缺失值上游写作 "-"，不是 0。
 *
 * 亏损公司没有市盈率，给的就是 "-"。当成 0 的话，页面上会出现
 * 「市盈率 0.00」——那读起来像「便宜到极点」，而不是「算不出来」。
 */
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/*
 * 比值类指标（市盈率、市净率）为 0 时当作没有。
 *
 * 指数没有市盈率、市净率，上游给的是 0 而不是 "-"。照数字显示就是
 * 「市盈率 0.00」——读起来像便宜到极点，而不是「这种标的没有这个指标」。
 * 现实里也不存在市盈率恰好为 0 的股票。
 */
const ratio = (value: unknown): number | null => {
  const parsed = numeric(value);
  return parsed === null || parsed === 0 ? null : parsed;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
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
    const text = Buffer.concat(chunks).toString("utf8");
    // 空 body 是限流时的表现（HTTP 200 加空内容），不是「这只股票不存在」。
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/*
 * 按定义推出来的每股数。
 *
 * 接口里的 f55/f92 是最新报告期口径，和市盈率(TTM)、市净率不是同一套基准。
 * 直接摆上去，页面上会出现「现价 ÷ 每股收益 ≠ 市盈率」这种自己打自己脸的
 * 组合，而每个数字单看都像是对的。
 *
 * 比值缺失或为 0 时推不出来，就不给——不能拿另一个口径顶上。
 */
const perShare = (last: number | null, ratio: number | null): number | null => {
  if (last === null || ratio === null || ratio === 0) return null;
  return last / ratio;
};

const readRow = (
  row: Record<string, unknown>,
  symbol: string,
): QuoteMetrics | null => {
  /*
   * 沪深的 f47 是手，港美股的 f47 已经是股。一律乘 100，腾讯与苹果的
   * 成交量就整整大了一百倍——而「16.87 亿股」这个数摆在那里毫无破绽。
   * 是拿「成交量 ≈ 流通股 × 换手率」对账才发现的。
   */
  const countsLots = !symbol.startsWith("hk") && !symbol.startsWith("us");
  const name = typeof row.f58 === "string" ? row.f58.trim() : "";
  if (name.length === 0) return null;

  const last = numeric(row.f43);
  const peTtm = ratio(row.f164);
  const priceToBook = ratio(row.f167);
  const lots = numeric(row.f47);

  return {
    amount: numeric(row.f48),
    amplitudePercent: numeric(row.f171),
    bookValuePerShare: perShare(last, priceToBook),
    changeAmount: numeric(row.f169),
    changePercent: numeric(row.f170),
    earningsPerShare: perShare(last, peTtm),
    floatMarketCap: numeric(row.f117),
    floatShares: numeric(row.f85),
    high: numeric(row.f44),
    last,
    limitDown: numeric(row.f52),
    limitUp: numeric(row.f51),
    low: numeric(row.f45),
    name,
    open: numeric(row.f46),
    orderRatioPercent: numeric(row.f191),
    peDynamic: ratio(row.f162),
    peStatic: ratio(row.f163),
    peTtm,
    previousClose: numeric(row.f60),
    priceToBook,
    symbol,
    totalMarketCap: numeric(row.f116),
    totalShares: numeric(row.f84),
    tradedAtSeconds: numeric(row.f86),
    turnoverPercent: numeric(row.f168),
    volumeRatio: numeric(row.f50),
    volumeShares:
      lots === null ? null : countsLots ? lots * SHARES_PER_LOT : lots,
    week52High: numeric(row.f174),
    week52Low: numeric(row.f175),
  };
};

/**
 * 一只标的的全部行情指标；取不到时返回 null。
 *
 * 返回 null 而不是一堆空字段：空字段会渲染出一整片「—」，看着像这只股票
 * 今天没有交易，而实际上是没问到。
 */
export const loadQuoteMetrics = async (
  rawSymbol: string,
): Promise<QuoteMetrics | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  for (const secid of secidsOf(symbol)) {
    const query = `secid=${secid}&fltt=2&fields=${FIELDS}`;
    let payload = await fetchJson(`${ORIGIN}${PATH}?${query}`);
    payload ??= await fetchJson(`${DELAYED_ORIGIN}${PATH}?${query}`);
    if (typeof payload !== "object" || payload === null) continue;
    const data = (payload as Record<string, unknown>).data;
    if (typeof data !== "object" || data === null) continue;
    const metrics = readRow(data as Record<string, unknown>, symbol);
    if (metrics !== null) return metrics;
  }
  return null;
};
