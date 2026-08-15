import { classifySymbol } from "../lib/symbol-category";

/*
 * 标的搜索。
 *
 * 站内搜索此前是在 35 个虚构标的里做本地过滤：搜「茅台」一条也搜不到，
 * 搜「星海智造」倒是有——一个只能搜到不存在的东西的搜索框。
 *
 * 现在打东方财富的公开搜索接口，支持代码、名称与拼音首字母。
 */

const ENDPOINT = "https://searchapi.eastmoney.com/api/suggest/get";
/*
 * 这个 token 是东财搜索页面公开使用的固定值，随页面一起下发，
 * 不是凭证，也不与任何账号绑定。
 */
const TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

/** 一次最多返回这么多条建议。再多下拉框也放不下。 */
export const MAX_SEARCH_HITS = 10;

/** 查询串上限。几 KB 的查询对上游没意义，只会白白占带宽。 */
const MAX_QUERY_LENGTH = 64;

export type SearchHit = Readonly<{
  /** 六位代码。 */
  code: string;
  /** 站内标的页地址；站内渲染不出来的为 null。 */
  href: string | null;
  /** 上游给的分类名，例如「沪A」「深A」「ETF」。 */
  kind: string;
  name: string;
  /** 带市场前缀的站内代码，例如 sh600519；拼不出时为 null。 */
  symbol: string | null;
}>;

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
    if (body.trim().length === 0) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * `"1.600519"` → `"sh600519"`。点号前 1 是沪市、0 是深市。
 *
 * 导出是为了让测试直接钉住这一步：前缀补错会把人送到另一只完全不同的
 * 股票上，而搜索结果那一行看起来完全正常。
 */
export const symbolOfQuoteId = (quoteId: unknown): string | null => {
  if (typeof quoteId !== "string") return null;
  const [market, code] = quoteId.split(".");
  if (code === undefined || code.length === 0) return null;

  /*
   * 港股与美股。
   *
   * 这两类原先一律给 null，理由是「站内没有它们的页面」——搜「腾讯」
   * 第一条就是腾讯控股 00700，却是一行点不动的文字。现在个股页支持这
   * 两个市场了，链接就该给。
   *
   * 三个美股市场码（105 纳斯达克、106 纽交所、107 美交所）都归到 us
   * 前缀：站内地址不区分交易所，交易所是打开页面时现问的。
   */
  if (market === "116") {
    return /^\d{1,5}$/u.test(code) ? `hk${code.padStart(5, "0")}` : null;
  }
  if (market === "105" || market === "106" || market === "107") {
    return /^[A-Za-z][A-Za-z0-9_]{0,9}$/u.test(code)
      ? `us${code.toLowerCase()}`
      : null;
  }

  if (!/^\d{6}$/u.test(code)) return null;
  if (market !== "0" && market !== "1") return null;

  const symbol = `${market === "1" ? "sh" : "sz"}${code}`;
  /*
   * 市场码 0 不只是深市——北交所（920367 等）和新三板（835688 等）也是 0。
   * 一律贴 sz 的话，搜「新赣江」会得到 sz920367，而那个地址是 404。
   *
   * 这里以 classifySymbol 为准：它是全站唯一那份号段表，认不出来就不给
   * 代码。这个接口不鉴权、对外公开，回一个不存在的代码等于把坑留给
   * 下一个信它的调用方（加自选、建组合都会照单全收）。
   */
  return classifySymbol(symbol) === "other" ? null : symbol;
};

/**
 * 按关键词搜标的；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让搜索框显示成「没有匹配的标的」，
 * 而那和「搜索暂时用不了」是两回事。
 */
export const searchInstruments = async (
  rawQuery: string,
): Promise<readonly SearchHit[] | null> => {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  // 空查询不发请求：上游会回一整页热门，那不是用户要的。
  if (query.length === 0) return [];

  const parameters = new URLSearchParams({
    count: String(MAX_SEARCH_HITS),
    input: query,
    token: TOKEN,
    // type=14 是「证券代码表」，也就是可交易标的。
    type: "14",
  });

  const payload = await fetchJson(`${ENDPOINT}?${parameters.toString()}`);
  if (typeof payload !== "object" || payload === null) return null;

  const table = (payload as Record<string, unknown>).QuotationCodeTable;
  if (typeof table !== "object" || table === null) return null;

  const data = (table as Record<string, unknown>).Data;
  // 没有匹配时上游给的是 null，那是「搜不到」，不是「取不到」。
  if (data === null) return [];
  if (!Array.isArray(data)) return null;

  const hits: SearchHit[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row.Code === "string" ? row.Code : "";
    const name = typeof row.Name === "string" ? row.Name : "";
    if (code.length === 0 || name.length === 0) continue;

    const symbol = symbolOfQuoteId(row.QuoteID);
    hits.push({
      code,
      /*
       * symbolOfQuoteId 已经保证：能给出代码的，站内一定渲染得出来。
       * 北交所、新三板，以及板块、期货、期权这些都会得到 null，因此不给
       * 链接——照样给的话，每一条搜索结果都点得进去、每一次都是空页。
       */
      href: symbol === null ? null : `/instruments/${symbol}`,
      kind:
        typeof row.SecurityTypeName === "string" ? row.SecurityTypeName : "",
      name,
      symbol,
    });
  }

  return hits.slice(0, MAX_SEARCH_HITS);
};
