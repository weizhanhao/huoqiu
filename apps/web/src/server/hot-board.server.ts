import { classifySymbol } from "../lib/symbol-category";

/*
 * 热股榜：三个市场的涨幅榜与跌幅榜。
 *
 * 右栏这块此前排的是站内那 35 个虚构标的（SYN001…），涨跌幅是写死的常量：
 * 切市场、切涨跌榜都有反应，但每一行都不是真的。
 *
 * 现在打东方财富的公开行情列表接口，和选股器同一个来源。排序、取前几名
 * 都由上游做——只对本地这几行重排，得到的是「这几只里的顺序」，
 * 却会被读成「全市场涨得最多的几只」。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 有些网络环境到 push2 不通，延时源仍可用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/clist/get";
const FIELDS = "f2,f3,f12,f13,f14";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;

/** 右栏那一小块只要前几名。要多了既慢又没人看。 */
export const HOT_BOARD_ROWS = 8;

/*
 * 榜单页要得多一些，但也有上限。
 * 不封顶的话，一个 ?rows=100000 就能让这个不鉴权的接口去拉整个市场。
 */
export const MAX_HOT_BOARD_ROWS = 50;

/*
 * 各市场在上游的筛选串。
 *
 * 沪深要把主板、创业板、科创板都算上，缺一块的话那一块的股票永远上不了榜。
 *
 * 北交所（m:0+t:81+s:2048，346 只）**不在**这里，这是有意的：它的涨跌幅
 * 上限是 30%，混进 20%/10% 的沪深榜里会长期霸占前几名——今天的涨幅榜第一
 * 和跌幅榜第二都是北交所的票——而站内没有它们的详情页，每一行都是点不动
 * 的死文本。这个串去掉北交所之后 total 正好是 5549，即沪深 A 股总数。
 */
const CN_FILTER = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
const HK_FILTER = "m:128+t:3,m:128+t:4,m:128+t:1,m:128+t:2";
const US_FILTER = "m:105,m:106,m:107";

const MARKET_FILTERS = {
  cn: CN_FILTER,
  /*
   * 「全球」= 三个市场一次问完。
   *
   * 这一栏我此前删掉了，理由是「把三个市场的涨跌幅混在一张表里排名没有
   * 可比意义」。那个理由站不住：涨跌幅本来就是无量纲的百分比，跨市场比
   * 正是这一栏的用处。
   *
   * 要紧的是排名交给上游。三个市场分别取前几名再在本地重排，得到的是
   * 「这十几只里的顺序」，却会被读成「全球涨得最多的几只」——中间差着
   * 两万多只标的。所以这里是一个 fs 圈住三个市场，让上游在全集上排。
   */
  global: `${CN_FILTER},${HK_FILTER},${US_FILTER}`,
  hk: HK_FILTER,
  us: US_FILTER,
} as const;

export type HotMarket = keyof typeof MARKET_FILTERS;
export type HotDirection = "gainers" | "losers";

export const hotMarkets = Object.keys(MARKET_FILTERS) as readonly HotMarket[];

export const isHotMarket = (value: string): value is HotMarket =>
  value in MARKET_FILTERS;

export const isHotDirection = (value: string): value is HotDirection =>
  value === "gainers" || value === "losers";

export type HotRow = Readonly<{
  changePercent: number | null;
  code: string;
  /** 站内标的页地址；暂无详情页的市场为 null。 */
  href: string | null;
  last: number | null;
  name: string;
}>;

export type HotBoard = Readonly<{
  /** 走的是延时源时为 true，页面据此如实标注。 */
  delayed: boolean;
  rows: readonly HotRow[];
}>;

const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // "-" 是「这只标的没有这个值」，不是 0。
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
    // 边读边数，超了就断开：先 await text() 的话上限等于没设。
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

/*
 * 上游的 diff 有两种形状。
 *
 * 沪深回的是数组，港股和美股回的是以 "0"、"1" 为键的对象。只按数组处理，
 * 港美两栏会永远显示成空——而界面上看起来就像那两个市场今天没有涨跌。
 */
const rowsOf = (diff: unknown): readonly unknown[] => {
  if (Array.isArray(diff)) return diff;
  if (typeof diff === "object" && diff !== null) {
    return Object.values(diff as Record<string, unknown>);
  }
  return [];
};

/*
 * 站内标的页地址。
 *
 * 认不认这个代码，以 classifySymbol 为准——它是全站唯一那份判断依据。
 * 自己再抄一份号段表迟早会和它漂移，而漂移的表现是链接照给、点进去是空页。
 *
 * 北交所的 92xxxx 虽然也是沪深两个前缀之一，但 classifySymbol 把它归在
 * 「其他」，站内渲染不出来，因此不给链接：先许诺点得进去、再给一张空页，
 * 比不给链接更糟。
 */
const hrefOf = (code: string, marketCode: unknown): string | null => {
  /*
   * 只看行自己的 f13，不看当前是哪个页签。
   *
   * 「全球」那一栏三个市场是混在一起的，同一张表里既有 sh600519 也有
   * AAPL——按页签去判市场，那一栏会整片拼错。而 f13 每一行都自带，
   * 三个页签也都对得上，不必分两套逻辑。
   */
  if (marketCode === 128) {
    /*
     * 港股。代码补到五位——上游多数时候给的就是 00700，但给 700 的
     * 时候不补零会拼出一个打不开的地址。
     */
    return /^\d{1,5}$/u.test(code)
      ? `/instruments/hk${code.padStart(5, "0")}`
      : null;
  }
  if (marketCode === 105 || marketCode === 106 || marketCode === 107) {
    // 美股。站内地址一律小写，且不区分交易所。
    return /^[A-Za-z][A-Za-z0-9_]{0,9}$/u.test(code)
      ? `/instruments/us${code.toLowerCase()}`
      : null;
  }
  if (marketCode !== 0 && marketCode !== 1) return null;

  if (!/^\d{6}$/u.test(code)) return null;
  // f13：1 是沪市，0 是深市。
  const symbol = `${marketCode === 1 ? "sh" : "sz"}${code}`;
  if (classifySymbol(symbol) === "other") return null;
  return `/instruments/${symbol}`;
};

/**
 * 某个市场的涨幅榜或跌幅榜前几名；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「这个市场今天没有涨跌」，
 * 那是另一回事。
 */
export const loadHotBoard = async (
  market: HotMarket,
  direction: HotDirection,
  rows: number = HOT_BOARD_ROWS,
): Promise<HotBoard | null> => {
  /*
   * 条数夹在有效范围内，不信调用方给的数。
   * 这个接口不鉴权，任何人都能拿它去压上游。
   */
  const size =
    Number.isInteger(rows) && rows >= 1
      ? Math.min(rows, MAX_HOT_BOARD_ROWS)
      : HOT_BOARD_ROWS;

  const parameters = new URLSearchParams({
    fid: "f3",
    fields: FIELDS,
    fs: MARKET_FILTERS[market],
    // 不带这个参数，上游回的是整数编码，价格会差一百倍。
    fltt: "2",
    pn: "1",
    // po=1 降序（涨幅榜），po=0 升序（跌幅榜）。
    po: direction === "gainers" ? "1" : "0",
    pz: String(size),
  });

  let delayed = false;
  let payload = await fetchJson(`${ORIGIN}${PATH}?${parameters.toString()}`);
  if (payload === null) {
    payload = await fetchJson(
      `${DELAYED_ORIGIN}${PATH}?${parameters.toString()}`,
    );
    delayed = true;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;

  const collected: HotRow[] = [];
  for (const entry of rowsOf((data as Record<string, unknown>).diff)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row.f12 === "string" ? row.f12 : "";
    const name = typeof row.f14 === "string" ? row.f14 : "";
    if (code.length === 0 || name.length === 0) continue;
    collected.push({
      changePercent: numeric(row.f3),
      code,
      href: hrefOf(code, row.f13),
      last: numeric(row.f2),
      name,
    });
  }

  if (collected.length === 0) return null;
  return { delayed, rows: collected.slice(0, size) };
};
