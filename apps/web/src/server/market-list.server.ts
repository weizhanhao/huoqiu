/*
 * 自选列表的批量行情。
 *
 * 来源：东方财富批量行情接口，免费、无需鉴权、已实测可用：
 *   https://push2.eastmoney.com/api/qt/ulist.np/get?secids=1.000001,0.300862,...
 *
 * 自选保存在浏览器本地，服务端并不知道有哪些标的，所以这里是
 * 「给一串代码、取一串价」，而不是像别的模块那样按单只代码取。
 *
 * 两个陷阱写在这里，免得以后有人顺手改掉：
 *
 * 一、必须带 fltt=2。
 *     不带的时候上游给的是整数编码——腾讯的 441000 是 441.00 元，
 *     -446 是 -4.46%。直接显示就是把股价放大一千倍，而页面上只会
 *     看起来「贵了点」。
 *
 * 二、secid 的市场前缀必须对。
 *     沪市是 1、深市是 0。弄反了会取回另一只股票的价格挂在这个名字下面，
 *     那比取不到危险得多——界面上完全看不出来。
 *
 * 这里不做缓存：自选看的就是此刻的价，缓存只会让用户盯着一个旧数字。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 主源限流时的备胎。数据晚十几分钟，但比一片空白有用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/ulist.np/get";
/*
 * f124 是成交时间（epoch 秒）。前端要靠它说明这个价是几点几分的。
 *
 * **不是 f86**。同一个字段号在两个接口里含义不同：stock/get 的 f86 才是
 * 时间戳，而这个批量接口的 f86 是个小数（实测茅台 0.01、蓝盾 5.98），
 * 拿它当秒数会把时间显示成 1970-01-01。同一套字段号、两种含义，
 * 和 f13 在这两个接口分别是 116 与 128 是同一类坑。
 */
const FIELDS = "f2,f3,f4,f12,f13,f14,f124";

/** 沪深六位、港股五位、美股字母代码。别的形态一律不发请求。 */
const SYMBOL_PATTERN = /^(?:(?:sh|sz)\d{6}|hk\d{1,5}|us[a-z][a-z0-9_]{0,9})$/u;

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;
/** 一次最多问这么多只；再多就是有人在拿列表刷接口。 */
const MAX_SYMBOLS = 200;

/*
 * 极短的进程内缓存。
 *
 * 这个接口不鉴权（行情本来就是公开数据），所以任何人都能拿这个部署去压
 * 上游。两秒的窗口短到用户看不出价格变旧，却足以把「同一串代码反复刷」
 * 折叠成一次外呼。
 */
const MICRO_CACHE_MS = 2_000;
const microCache = new Map<
  string,
  { at: number; value: readonly ListQuote[] }
>();
/** 缓存本身不能变成内存耗尽的入口。 */
const MAX_CACHE_KEYS = 500;

/**
 * 清空微缓存。
 *
 * 给测试用：两个用例问同一串代码时，后一个会命中前一个留下的缓存，
 * 于是「上游失败应返回 null」这类断言会拿到上一条的成功结果而误绿。
 */
export const resetListQuoteCache = (): void => {
  microCache.clear();
};

/*
 * 品种分类挪到了 src/lib/symbol-category.ts。
 * 自选行情表是客户端组件，从这里引函数会把整个取数模块打进浏览器包。
 * 这里重导出，让既有调用方不必改导入路径。
 */
export { classifySymbol, type SymbolCategory } from "../lib/symbol-category";

export type ListQuote = Readonly<{
  /** 成交时间，epoch 秒；上游没给时为 null。 */
  tradedAtSeconds: number | null;
  changeAmount: number | null;
  /** 百分数。 */
  changePercent: number | null;
  last: number | null;
  name: string | null;
  /** 调用方传进来的那个形式，原样还回去。 */
  symbol: string;
}>;

/*
 * 站内代码 → 上游 secid。一只可能对应多个候选。
 *
 * 沪深一对一：sh600519 → 1.600519，沪市是 1、深市是 0。
 * 港股是 116。
 *
 * 美股的交易所看代码分不出来（105 纳斯达克、106 纽交所、107 美交所），
 * 而这个接口一次要问几十只，逐只去试代价太大。ulist 允许一次问多个
 * secid、认不出的那些不回行——所以三个都塞进去，让上游自己挑。
 */
const secidsOf = (symbol: string): readonly string[] => {
  if (symbol.startsWith("hk")) {
    return [`116.${symbol.slice(2).padStart(5, "0")}`];
  }
  if (symbol.startsWith("us")) {
    const ticker = symbol.slice(2).toUpperCase();
    return [`105.${ticker}`, `106.${ticker}`, `107.${ticker}`];
  }
  return [`${symbol.startsWith("sh") ? "1" : "0"}.${symbol.slice(2)}`];
};

const numeric = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // "-" 是「这只标的没有这个值」，不是 0。
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
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
    /*
     * 边读边数，超了就断开。
     *
     * 早先是先 await response.text() 再看长度——那时整个响应已经进内存了，
     * 这个上限等于没设。
     */
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 批量取一串标的的实时行情；一只都问不了或上游失败时返回 null。
 *
 * 认不出来的代码直接丢掉，不猜市场前缀——猜错会取回另一只股票的价格
 * 挂在这个名字下面。
 */
export const loadListQuotes = async (
  symbols: readonly string[],
): Promise<readonly ListQuote[] | null> => {
  const addressable = symbols
    .map((symbol) => symbol.trim().toLowerCase())
    .filter((symbol) => SYMBOL_PATTERN.test(symbol))
    .slice(0, MAX_SYMBOLS);
  if (addressable.length === 0) return null;

  const cacheKey = addressable.join(",");
  const cached = microCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < MICRO_CACHE_MS) {
    return cached.value;
  }

  const query = new URLSearchParams({
    fields: FIELDS,
    // 不带这个参数，上游回的是整数编码，价格会差一千倍。
    fltt: "2",
    invt: "2",
    secids: addressable.flatMap(secidsOf).join(","),
  });
  /*
   * 主源取不到就走延时源。
   *
   * 这是全站最后一个没有回退的取数模块，而指数条、自选行情和组合当日收益
   * 都靠它。主源对这个端点会限流——回的是 200 加一个空响应体，不是 500——
   * 一限流这三处同时变成「—」，/api/market/quotes 直接 502。
   *
   * 一份晚十几分钟的真行情，比一片空白有用得多。
   */
  let payload = await fetchJson(`${ORIGIN}${PATH}?${query.toString()}`);
  if (payload === null) {
    payload = await fetchJson(`${DELAYED_ORIGIN}${PATH}?${query.toString()}`);
  }
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  const diff = (data as Record<string, unknown>).diff;
  if (!Array.isArray(diff)) return null;

  /*
   * 上游按 f12（六位代码）+ f13（市场码）标识每一行，而调用方传进来的是
   * sh/sz 形式。这里按代码回填，保证还回去的 symbol 就是问的那个——
   * 顺序错位会让价格挂到别的名字下面。
   */
  const byCode = new Map<string, Record<string, unknown>>();
  for (const entry of diff) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = text(row.f12);
    const market = numeric(row.f13);
    if (code === null || market === null) continue;
    /*
     * 按 f13 分市场回填。港股是 128、美股是 105/106/107，若一概套用沪深
     * 那条 `market === 1 ? sh : sz`，00700 会拼成 sz00700——一个不存在的
     * 代码，于是这一行照旧空着，而请求其实是成功的。
     */
    /*
     * 港股这里是 116。热股榜走的 clist 对同一个市场用的是 128（筛选串里
     * 写的就是 m:128），两个端点编号不一致——两个都收下，省得日后换端点
     * 时又静静掉一批行。
     */
    if (market === 116 || market === 128) {
      byCode.set(`hk${code}`, row);
      continue;
    }
    if (market === 105 || market === 106 || market === 107) {
      byCode.set(`us${code.toLowerCase()}`, row);
      continue;
    }
    byCode.set(`${market === 1 ? "sh" : "sz"}${code}`, row);
  }

  const quotes = addressable.flatMap((symbol): readonly ListQuote[] => {
    /*
     * 上游认得 hk700，回来的却是 00700。按原样查表就对不上，这一行会静静
     * 少掉：请求成功、别的行都在，只有它没有价，看着像这只票停牌了。
     */
    const row =
      byCode.get(symbol) ??
      (symbol.startsWith("hk")
        ? byCode.get(`hk${symbol.slice(2).padStart(5, "0")}`)
        : undefined);
    if (row === undefined) return [];
    return [
      {
        changeAmount: numeric(row.f4),
        changePercent: numeric(row.f3),
        last: numeric(row.f2),
        name: text(row.f14),
        symbol,
        tradedAtSeconds: numeric(row.f124),
      },
    ];
  });

  // 缓存满了整体清空：宁可短暂多打几次上游，也不能让缓存把进程拖垮。
  if (microCache.size > MAX_CACHE_KEYS) microCache.clear();
  microCache.set(cacheKey, { at: Date.now(), value: quotes });
  return quotes;
};
