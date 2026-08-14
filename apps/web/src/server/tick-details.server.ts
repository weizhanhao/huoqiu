/*
 * 成交明细。
 *
 * 雪球图右下角那一列：时间、成交价、手数，买盘红、卖盘绿。站内此前没有。
 *
 * 方向那一位是这里最阴的东西。网上普遍写的是「1=买 2=卖」，而拿真实数据
 * 对了一遍（茅台 120 笔），结论正好相反：
 *   方向=1 时价降 53 次、价升 4 次
 *   方向=2 时价升 45 次、价降 4 次
 * 也就是 1 是卖盘、2 是买盘。照通行说法映射，每一笔的红绿都是反的——
 * 而那张表看起来完全正常，没有任何一行能让人起疑。
 *
 * 这个接口只有东财有（腾讯的 dealsdata controller 不存在），而东财那两个源
 * 在服务端会成片断连，所以两路各自兜异常：主源抛出来时必须真的落到延时源，
 * 不能两路套在同一个 try 里——那样主源一抛就跳到 catch，延时源永远轮不到。
 */

const ORIGIN = "https://push2.eastmoney.com";
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/stock/details/get";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

/** 一手 100 股。沪深按手给，港美股按股。 */
const SHARES_PER_LOT = 100;

/** 右侧那一列放得下几行。多了会把盘口挤出视野，而看盘只看最近几笔。 */
const TICK_COUNT = 7;

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

/** 站内代码 → 上游 secid。美股的交易所要试，这里依次给三个。 */
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

const numeric = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const attempt = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const response = await fetch(url, {
    headers: {
      Referer: "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
    signal,
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
  // 空 body 是限流的表现，不是「这只股票今天没有成交」。
  if (text.trim().length === 0) return null;
  return JSON.parse(text) as unknown;
};

const fetchJson = async (path: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  /*
   * 每一路各自兜住异常。主源掐断连接时 fetch 直接抛，不是回错误码——
   * 两路套在同一个 try 里，延时源永远轮不到。
   */
  const tryOne = async (origin: string): Promise<unknown> => {
    try {
      return await attempt(`${origin}${path}`, controller.signal);
    } catch {
      return null;
    }
  };
  try {
    return (await tryOne(ORIGIN)) ?? (await tryOne(DELAYED_ORIGIN));
  } finally {
    clearTimeout(timer);
  }
};

/*
 * 方向：1 是卖、2 是买，其余按中性。
 *
 * 这是拿真实数据对出来的，不是照文档抄的——通行说法是反的。
 */
const sideOf = (flag: string | undefined): TickSide => {
  if (flag === "1") return "sell";
  if (flag === "2") return "buy";
  return "neutral";
};

/**
 * 最近若干笔成交；取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会渲染出一张空表，看着像这只股票今天
 * 一笔都没成交，而实际上是没问到。
 */
export const loadTickDetails = async (
  rawSymbol: string,
): Promise<TickTape | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  // 沪深按手给量，港美股按股。
  const countsLots = !symbol.startsWith("hk") && !symbol.startsWith("us");

  for (const secid of secidsOf(symbol)) {
    const payload = await fetchJson(
      `${PATH}?secid=${secid}&fields1=f1,f2,f3,f4` +
        `&fields2=f51,f52,f53,f54,f55&pos=-${String(TICK_COUNT)}`,
    );
    if (typeof payload !== "object" || payload === null) continue;
    const data = (payload as Record<string, unknown>).data;
    if (typeof data !== "object" || data === null) continue;
    const rows = (data as Record<string, unknown>).details;
    if (!Array.isArray(rows)) continue;

    const ticks: Tick[] = [];
    for (const raw of rows) {
      if (typeof raw !== "string") continue;
      const parts = raw.split(",");
      if (parts.length < 3) continue;
      const [time, priceText, volumeText] = parts;
      if (time === undefined || !/^\d{2}:\d{2}:\d{2}$/u.test(time)) continue;
      const price = numeric(priceText);
      const volume = numeric(volumeText);
      if (price === null || volume === null) continue;
      ticks.push({
        price,
        side: sideOf(parts[4]),
        time,
        volumeShares: countsLots ? volume * SHARES_PER_LOT : volume,
      });
    }

    if (ticks.length === 0) continue;
    return {
      previousClose: numeric((data as Record<string, unknown>).prePrice),
      symbol,
      // 上游从早到晚给，看盘要的是最近几笔。
      ticks: ticks.reverse(),
    };
  }

  return null;
};
