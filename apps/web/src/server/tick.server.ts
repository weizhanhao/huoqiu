/*
 * 分时成交切片、分价表，以及官方资金流。
 *
 * 站内此前把成交明细、分价表、大单统计三项标成「需要 Level-2 数据，
 * 免费源给不全」，链到腾讯去。那句话是错的——公开接口取得到。
 *
 * 但这份数据**不是逐笔**，我一开始把它当成逐笔用了，那是个实打实的错误。
 * 两个独立证据：
 *   一、时间戳零重复。601398 全天 4943 行，没有任何两行同一秒——
 *       真正的逐笔一秒里会有几十笔。
 *   二、手数对不上官方总量。同一只票切片手数合计 5,878,535，
 *       而快照 f47 只有 3,889,548，差 51%；用 f48/f47 反推单价得 7.54 元
 *       （工行的真实价位），用切片手数反推只有 4.99 元。
 * 所以每一行是一个成交切片，第四列是该切片内的**笔数**（601398 全天合计
 * 132,151 笔，对 4943 个切片）。
 *
 * 由此带来的后果，必须写下来免得有人再犯：
 *   · 「全天共 N 笔」不能用行数，那会把 13 万笔说成 4900 笔；
 *   · 大单统计**不能**从这里算。按切片成交额分档得到的结果，与东财官方
 *     口径在个股上符号相反（平安银行：站内算出特大单净 −0.79 亿，
 *     官方是 +0.56 亿）。所以那张表改用官方资金流接口，见 loadMoneyFlow。
 *
 * 方向仍是可信的：2 是主动买、1 是主动卖，涨跌跳动的对应关系非常干净
 * （601398 上跳 916 次里 914 次是方向 2）。4 是 09:25 之前的集合竞价参考量，
 * 且是累计值——601398 那段最大单值 222 却合计 10,073，算进去会虚增几十倍。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 主源对这个端点会限流返空；延时源稳定得多。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/stock/details/get";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;

/** 一次最多取这么多笔；一天的逐笔通常在几千条量级。 */
const MAX_TICKS = 20_000;

/** 集合竞价参考量的方向值，不是成交。 */
const AUCTION = "4";
/** 主动买。 */
const BUY = "2";

export type TickSide = "buy" | "sell";

export type Tick = Readonly<{
  /** HH:MM:SS，交易所本地时间。 */
  at: string;
  price: number;
  side: TickSide;
  /** 这一个切片里的成交笔数。不是 1——一个切片可能含上百笔。 */
  trades: number;
  /** 手。 */
  volumeHands: number;
}>;

export type PriceLevel = Readonly<{
  /** 主动买的手数。 */
  buyHands: number;
  price: number;
  /** 主动卖的手数。 */
  sellHands: number;
  totalHands: number;
}>;

/*
 * 资金流分档。
 *
 * 这四个数**不是**站内算的，是东财官方给的（ulist.np 的 f66/f72/f78/f84）。
 *
 * 为什么不自己算：上面说过，details 给的是切片不是单笔。按切片成交额分档
 * 得到的结果与官方口径在个股上符号相反——平安银行站内算出特大单净
 * −0.79 亿，官方是 +0.56 亿。一个看起来完全正常、方向却相反的数字，
 * 比没有这张表危险得多。
 */
export type MoneyFlowTier = Readonly<{
  label: string;
  /** 元。买入减卖出，上游直接给净额。 */
  netAmount: number;
  /** 百分数，占当日成交额的比例。上游给不出时为 null。 */
  netPercent: number | null;
  slug: "huge" | "large" | "medium" | "small";
}>;

export type MoneyFlow = Readonly<{
  /** 元。主力净流入，等于超大单加大单。 */
  mainNetAmount: number | null;
  tiers: readonly MoneyFlowTier[];
}>;

export type TickBoard = Readonly<{
  /** 走的是延时源时为 true，页面据此如实标注。 */
  delayed: boolean;
  levels: readonly PriceLevel[];
  prevClose: number | null;
  symbol: string;
  /** 全天成交切片，时间升序。注意：一行是一个切片，不是一笔。 */
  ticks: readonly Tick[];
  /** 全天真实成交笔数（各切片笔数之和）。 */
  trades: number;
}>;

/** 沪深六位代码，带 sh/sz 前缀。别的形态一律不发请求。 */
const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;

/** sh600519 → 1.600519；沪市是 1、深市是 0。 */
const secid = (symbol: string): string =>
  `${symbol.startsWith("sh") ? "1" : "0"}.${symbol.slice(2)}`;

const numeric = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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
    // 主源限流时回的是空响应体，JSON.parse 会抛。
    if (body.trim().length === 0) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 把上游那一行拆成一笔成交；集合竞价参考量与残缺行返回 null。
 *
 * 导出是为了让测试直接钉住列序与方向语义：错一位，页面上「主动买」
 * 显示的就是主动卖，而那张表看起来完全正常。
 */
export const parseTick = (raw: string): Tick | null => {
  const cells = raw.split(",");
  if (cells.length < 5) return null;
  // 09:25 之前方向为 4 的是集合竞价参考量，不是成交。
  if (cells[4] === AUCTION) return null;

  const at = cells[0]?.trim() ?? "";
  const price = numeric(cells[1]);
  const volumeHands = numeric(cells[2]);
  if (!/^\d{2}:\d{2}:\d{2}$/u.test(at)) return null;
  if (price === null || volumeHands === null || volumeHands <= 0) return null;

  return {
    at,
    price,
    side: cells[4] === BUY ? "buy" : "sell",
    // 第四列是这个切片内的笔数。缺失时按 1 计，不按 0——那会让全天笔数偏低。
    trades: Math.max(1, Math.round(numeric(cells[3]) ?? 1)),
    volumeHands,
  };
};

/**
 * 分价表：每个成交价上的总手数，以及其中主动买、主动卖各占多少。
 *
 * 价格降序——高价在上，与盘口的读法一致。
 */
export const priceLevelsOf = (ticks: readonly Tick[]): readonly PriceLevel[] => {
  const byPrice = new Map<number, { buy: number; sell: number }>();
  for (const tick of ticks) {
    const bucket = byPrice.get(tick.price) ?? { buy: 0, sell: 0 };
    if (tick.side === "buy") bucket.buy += tick.volumeHands;
    else bucket.sell += tick.volumeHands;
    byPrice.set(tick.price, bucket);
  }

  return [...byPrice.entries()]
    .map(([price, bucket]) => ({
      buyHands: bucket.buy,
      price,
      sellHands: bucket.sell,
      totalHands: bucket.buy + bucket.sell,
    }))
    .sort((left, right) => right.price - left.price);
};

/**
 * 一只标的的全天逐笔与两张派生表；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天一笔没成交」，
 * 那是另一回事。
 */
export const loadTickBoard = async (
  rawSymbol: string,
): Promise<TickBoard | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const query = new URLSearchParams({
    fields1: "f1,f2,f3,f4",
    fields2: "f51,f52,f53,f54,f55",
    pos: `-${MAX_TICKS}`,
    secid: secid(symbol),
  });

  let delayed = false;
  let payload = await fetchJson(`${ORIGIN}${PATH}?${query.toString()}`);
  if (payload === null) {
    payload = await fetchJson(`${DELAYED_ORIGIN}${PATH}?${query.toString()}`);
    delayed = true;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;

  const raw = (data as Record<string, unknown>).details;
  if (!Array.isArray(raw)) return null;

  const ticks = raw
    .filter((row): row is string => typeof row === "string")
    .map((row) => parseTick(row))
    .filter((tick): tick is Tick => tick !== null)
    /*
     * 收盘之后的行不算当日成交。
     *
     * 15:00:59 之后还会有盘后固定价格与大宗回报，它们不计入当日成交量，
     * 却全部印在收盘价上——留着会在分价表的收盘价那一档堆出一根假的长条。
     */
    .filter((tick) => tick.at <= "15:00:59");
  if (ticks.length === 0) return null;

  const prevClose = (data as Record<string, unknown>).prePrice;

  return {
    delayed,
    levels: priceLevelsOf(ticks),
    prevClose: typeof prevClose === "number" ? prevClose : null,
    symbol,
    ticks,
    // 笔数是各切片笔数之和，不是行数——用行数会把十三万笔说成四千多笔。
    trades: ticks.reduce((total, tick) => total + tick.trades, 0),
  };
};

/*
 * 官方资金流。
 *
 * f62 主力净流入（= 超大单 + 大单），f66/f69 超大单净额与净占比，
 * f72/f75 大单，f78/f81 中单，f84/f87 小单。四档净额之和应当为 0——
 * 每一笔买都有对应的卖，这是这份数据自带的自检。
 */
const FLOW_PATH = "/api/qt/ulist.np/get";

const FLOW_TIERS = [
  { label: "超大单", net: "f66", pct: "f69", slug: "huge" },
  { label: "大单", net: "f72", pct: "f75", slug: "large" },
  { label: "中单", net: "f78", pct: "f81", slug: "medium" },
  { label: "小单", net: "f84", pct: "f87", slug: "small" },
] as const;

/**
 * 一只标的的当日资金流；上游取不到时返回 null。
 *
 * 这四个数由交易所口径的官方接口给出，站内不再自己分档——自己算过一次，
 * 结果与官方符号相反，因为输入不是单笔。
 */
export const loadMoneyFlow = async (
  rawSymbol: string,
): Promise<MoneyFlow | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const query = new URLSearchParams({
    fields: "f12,f62,f66,f69,f72,f75,f78,f81,f84,f87",
    fltt: "2",
    secids: secid(symbol),
  });

  let payload = await fetchJson(`${ORIGIN}${FLOW_PATH}?${query.toString()}`);
  if (payload === null) {
    payload = await fetchJson(
      `${DELAYED_ORIGIN}${FLOW_PATH}?${query.toString()}`,
    );
  }
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  const diff = (data as Record<string, unknown>).diff;
  const rows = Array.isArray(diff)
    ? diff
    : typeof diff === "object" && diff !== null
      ? Object.values(diff as Record<string, unknown>)
      : [];
  const row = rows[0];
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;

  const asNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  const tiers = FLOW_TIERS.map((tier) => ({
    label: tier.label,
    netAmount: asNumber(record[tier.net]) ?? 0,
    netPercent: asNumber(record[tier.pct]),
    slug: tier.slug,
  }));
  // 一档都没有就是没取到，不给一张四行全零的表。
  if (FLOW_TIERS.every((tier) => asNumber(record[tier.net]) === null)) {
    return null;
  }

  return { mainNetAmount: asNumber(record.f62), tiers };
};
