/*
 * 港股与美股的行情。
 *
 * 站内此前只有沪深：热股榜的港股、美股两个页签切得过去但点不动，每一行
 * 都是死文本。理由曾经是「站内没有它们的详情页」——可数据一直都在。
 *
 * 沪深那一套走的是新浪（market-quote.server.ts），只认 sh/sz 六位代码。
 * 这里另起一份，不去改那边：几个上游的字段、代码格式、限流表现都不一样，
 * 硬塞进一个函数里，最后是两边都不敢动。
 *
 * 报价走东财、日 K 走腾讯，不是随手混搭，是打过之后的结果：
 * 东财的 push2his 日 K 在服务端密集调用下会成片断连（背靠背 20 次只成 1 次，
 * 同一秒 curl 却通），腾讯那条 20/20 全过；报价则相反，东财 15/15 稳，
 * 而且与热股榜同源，涨跌幅口径一致。
 *
 * 四个坑：
 *   1. 美股的市场码要试。105 纳斯达克、106 纽交所、107 美交所，
 *      光看代码分不出来；
 *   2. 腾讯那边美股要带交易所后缀。不带的话它照样回 code:0，只是把字段
 *      从 qfqday 换成 day，内容是 2011 年的——图画得出来、形状也正常，
 *      就是差了十五年。报价那步已经问出它在哪个所了，后缀跟着来即可；
 *   3. 港股代码五位，要补零——00700 不是 700；
 *   4. 日 K 每行是「日期,开,收,高,低,成交量」，收在第三位、高在第四位。
 *      按「开高低收」读会把收盘价当成最高价，而画出来的图看着仍然像模像样。
 */

import type { InstrumentQuote } from "./market-quote.server";

const QUOTE_ORIGIN = "https://push2delay.eastmoney.com";
const KLINE_ORIGIN = "https://web.ifzq.gtimg.cn";
const REFERER = "https://quote.eastmoney.com/";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** 港股在东财的市场码。 */
const HK_MARKET = 116;

/*
 * 美股按交易所分三个市场码，给定代码看不出是哪个，只能依次试。
 * 后缀是腾讯那边的写法，两边一一对应；美交所（107）腾讯不提供日 K，
 * 所以它只有报价、没有图——这比拿别的所的图顶上要好。
 */
const US_EXCHANGES = [
  { market: 105, suffix: ".OQ" },
  { market: 106, suffix: ".N" },
  { market: 107, suffix: null },
] as const;

/** 一次取多少根日线。 */
const DEFAULT_BAR_COUNT = 180;

export type OverseasMarket = "hk" | "us";

export type OverseasBar = Readonly<{
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volume: number;
}>;

export type OverseasQuote = Readonly<{
  amount: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  high: number | null;
  last: number | null;
  low: number | null;
  open: number | null;
  previousClose: number | null;
  /** 上游给的是 epoch 秒，不是北京时间的墙上时刻。 */
  tradedAtSeconds: number | null;
  volume: number | null;
}>;

export type OverseasSnapshot = Readonly<{
  bars: readonly OverseasBar[];
  fetchedAt: string;
  market: OverseasMarket;
  name: string;
  quote: OverseasQuote;
  symbol: string;
}>;

/**
 * `hk00700` / `usaapl` → 市场与上游用的代码。
 *
 * 港股补到五位；美股统一大写（上游对大小写敏感）。认不出来返回 null——
 * 猜一个市场出来，等于给用户一张别人的行情。
 */
export const parseOverseasSymbol = (
  raw: string,
): Readonly<{ code: string; market: OverseasMarket }> | null => {
  const symbol = raw.trim().toLowerCase();

  if (symbol.startsWith("hk")) {
    const digits = symbol.slice(2);
    if (!/^\d{1,5}$/u.test(digits)) return null;
    return { code: digits.padStart(5, "0"), market: "hk" };
  }

  if (symbol.startsWith("us")) {
    const ticker = symbol.slice(2);
    // 美股代码是字母，带点或横杠的（BRK.B）上游写成下划线。
    if (!/^[a-z][a-z0-9_]{0,9}$/u.test(ticker)) return null;
    return { code: ticker.toUpperCase(), market: "us" };
  }

  return null;
};

const numeric = (raw: unknown): number | null =>
  typeof raw === "number" && Number.isFinite(raw) ? raw : null;

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Referer: REFERER, "User-Agent": "Mozilla/5.0" },
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
    /*
     * 空 body 是上游限流时的表现（HTTP 200 加空内容），不是
     * 「这只股票不存在」。两者这里都返回 null，但别把它当后者去缓存。
     */
    if (text.trim().length === 0) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchJson = async (url: string): Promise<unknown> => {
  const text = await fetchText(url);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const QUOTE_FIELDS = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f86,f169,f170";

/** 取一个 secid 的报价；上游对不存在的组合回 data:null。 */
const fetchQuoteAt = async (
  secid: string,
): Promise<Readonly<{ name: string; quote: OverseasQuote }> | null> => {
  const payload = await fetchJson(
    `${QUOTE_ORIGIN}/api/qt/stock/get?secid=${secid}&fltt=2&fields=${QUOTE_FIELDS}`,
  );
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;

  const row = data as Record<string, unknown>;
  const name = typeof row.f58 === "string" ? row.f58.trim() : "";
  if (name.length === 0) return null;

  return {
    name,
    quote: {
      amount: numeric(row.f48),
      changeAmount: numeric(row.f169),
      changePercent: numeric(row.f170),
      high: numeric(row.f44),
      last: numeric(row.f43),
      low: numeric(row.f45),
      open: numeric(row.f46),
      previousClose: numeric(row.f60),
      tradedAtSeconds: numeric(row.f86),
      volume: numeric(row.f47),
    },
  };
};

/*
 * 日线走腾讯。返回的是 JSONP：`k={...}`，没有结尾分号。
 *
 * 只认 qfqday。带 day 而不带 qfqday 的响应要么是空的（代码不存在），
 * 要么是十几年前的陈货，两种都不能画出来。
 */
const fetchBars = async (
  key: string,
  count: number,
): Promise<readonly OverseasBar[]> => {
  const path = key.startsWith("hk") ? "hkfqkline" : "usfqkline";
  const text = await fetchText(
    `${KLINE_ORIGIN}/appstock/app/${path}/get` +
      `?_var=k&param=${key},day,,,${String(count)},qfq`,
  );
  if (text === null) return [];

  const separator = text.indexOf("=");
  if (separator === -1) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(text.slice(separator + 1).replace(/;\s*$/u, ""));
  } catch {
    return [];
  }
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return [];
  const entry = (data as Record<string, unknown>)[key];
  if (typeof entry !== "object" || entry === null) return [];
  const rows = (entry as Record<string, unknown>).qfqday;
  if (!Array.isArray(rows)) return [];

  const bars: OverseasBar[] = [];
  for (const row of rows) {
    /*
     * 港股行 9 列（第 7 个是个空对象），美股 6 列，前 6 列一致：
     * 日期,开,收,高,低,成交量 —— 收在第三位、高在第四位。
     * 按「开高低收」读，收盘价会被当成最高价。
     */
    if (!Array.isArray(row) || row.length < 6) continue;
    const [date, open, close, high, low, volume] = row as readonly unknown[];
    if (typeof date !== "string") continue;
    const values = [open, close, high, low, volume].map((raw) => Number(raw));
    if (values.some((value) => !Number.isFinite(value))) continue;
    bars.push({
      close: values[1] as number,
      date,
      high: values[2] as number,
      low: values[3] as number,
      open: values[0] as number,
      volume: values[4] as number,
    });
  }
  return bars;
};

/*
 * epoch 毫秒 → 北京时间的墙上时刻，形如 2026-08-14T10:26:47。
 *
 * 沪深那条路存的就是这个形状（不带时区后缀），报价头拿到手只做
 * replace("T"," ") 就直接显示。这里若交出 UTC，10:26 的行情会写成
 * 「02:26」——看盘的人对着一个差八小时的时间，不会怀疑是时区，
 * 只会以为这数据是几小时前的。
 *
 * 用 sv-SE 是因为它的日期格式恰好就是 YYYY-MM-DD HH:mm:ss。
 */
const beijingWallClock = (epochMs: number): string =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  })
    .format(new Date(epochMs))
    .replace(" ", "T");

/**
 * 交给详情页的报价头。形状是照沪深定的（InstrumentQuote）。
 *
 * 缺一个关键数值就整个不给，让页面不渲染报价头——把缺失的价格显示成 0，
 * 看着就是一只跌到零的股票。五档留空：免费接口给不出港美股的盘口，
 * 空数组会让报价头整块略去它，而不是摆一张全是「—」的表。
 */
export const toInstrumentQuote = (
  snapshot: OverseasSnapshot | null,
): InstrumentQuote | null => {
  if (snapshot === null) return null;
  const {
    amount,
    high,
    last,
    low,
    open,
    previousClose,
    tradedAtSeconds,
    volume,
  } = snapshot.quote;
  if (
    amount === null ||
    high === null ||
    last === null ||
    low === null ||
    open === null ||
    previousClose === null ||
    volume === null
  ) {
    return null;
  }

  return {
    amount,
    asks: [],
    bids: [],
    high,
    last,
    low,
    open,
    prevClose: previousClose,
    tradedAt: beijingWallClock(
      (tradedAtSeconds ?? Math.floor(Date.parse(snapshot.fetchedAt) / 1000)) *
        1000,
    ),
    volume,
  };
};

/**
 * 一只港股或美股的报价与日线；取不到时返回 null。
 *
 * 返回 null 而不是一个空壳：空壳会渲染出一只没有任何数字的股票，
 * 看起来像「这只票今天没交易」。
 */
export const loadOverseasSnapshot = async (
  rawSymbol: string,
  barCount = DEFAULT_BAR_COUNT,
): Promise<OverseasSnapshot | null> => {
  const parsed = parseOverseasSymbol(rawSymbol);
  if (parsed === null) return null;

  /*
   * 报价那步顺带问出它在哪个交易所，日线的后缀直接跟着来。
   * 让日线自己去猜后缀，猜错了拿到的是 2011 年的数据，而且不报错。
   */
  const candidates =
    parsed.market === "hk"
      ? [
          {
            barKey: `hk${parsed.code}`,
            secid: `${String(HK_MARKET)}.${parsed.code}`,
          },
        ]
      : US_EXCHANGES.map((exchange) => ({
          /*
           * 下划线换回点号。同一只股票两边写法不一样：伯克希尔 B 股在东财
           * 是 BRK_B，在腾讯是 BRK.B。拿东财那份去问腾讯，回的是 code:0
           * 加一个空的 day——不报错，只是这只股票永远没有图。
           */
          barKey:
            exchange.suffix === null
              ? null
              : `us${parsed.code.replaceAll("_", ".")}${exchange.suffix}`,
          secid: `${String(exchange.market)}.${parsed.code}`,
        }));

  for (const candidate of candidates) {
    const quote = await fetchQuoteAt(candidate.secid);
    if (quote === null) continue;
    /*
     * 美交所的票腾讯不给日 K。照实给报价、日线留空，让页面自己说
     * 「暂无日线」——不能因为没有图就把整只股票判成不存在。
     */
    const bars =
      candidate.barKey === null
        ? []
        : await fetchBars(candidate.barKey, barCount);
    return {
      bars,
      fetchedAt: new Date().toISOString(),
      market: parsed.market,
      name: quote.name,
      quote: quote.quote,
      symbol: rawSymbol.trim().toLowerCase(),
    };
  }

  return null;
};
