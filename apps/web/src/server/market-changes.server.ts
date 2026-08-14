import { classifySymbol } from "../lib/symbol-category";

/*
 * 盘口异动。
 *
 * 我上一轮说「免费的异动接口返回 rc:102，做不了」——那是错的结论：
 * 缺的只是 `dpt=wzchanges` 这个参数。加上它之后全天九千多条异动都取得到。
 *
 * 22 个异动类型的编码与涨跌方向不是猜的，是从东财异动页自己的筛选框里
 * 抄下来的（`<input value="8201"/><span class="price_up">火箭发射</span>`）。
 * 我先前照数据形态推断过一版，错了好几处：32 是「打开跌停板」而不是
 * 「封跌停板」，64 是「有大买盘」，128 是「有大卖盘」。
 *
 * `i` 字段里的数字**逐类型排列不同**——t=4 是「价,量,价,涨幅」，
 * t=8201 是「涨幅,价,涨幅」，t=32 只有「价,涨幅」。这里不解析它：
 * 按一种排列去读所有类型，会把成交量当成价格显示在页面上，
 * 而那一行看起来完全正常。
 */

const ORIGIN = "https://push2ex.eastmoney.com";
const PATH = "/getAllStockChanges";
/*
 * 这个 ut 是东财异动页随页面下发的固定值，不是凭证，也不与账号绑定。
 * dpt 缺了会直接被拒（rc:102）。
 */
const UT = "7eea3edcaed734bea9cbfc24409ed989";
const DPT = "wzchanges";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;

/** 一次最多列这么多条。全天九千多条，没人会往下翻到底。 */
export const MAX_CHANGE_ROWS = 30;

/*
 * 异动类型。
 *
 * code 与 label 抄自东财异动页的筛选框，tone 取自它给每一项标的
 * price_up / price_down 类名——那是数据源自己的判断，不是我们的解读。
 */
const CHANGE_TYPES = [
  { code: "8201", label: "火箭发射", tone: "up" },
  { code: "8202", label: "快速反弹", tone: "up" },
  { code: "8193", label: "大笔买入", tone: "up" },
  { code: "4", label: "封涨停板", tone: "up" },
  { code: "32", label: "打开跌停板", tone: "up" },
  { code: "64", label: "有大买盘", tone: "up" },
  { code: "8207", label: "竞价上涨", tone: "up" },
  { code: "8209", label: "高开5日线", tone: "up" },
  { code: "8211", label: "向上缺口", tone: "up" },
  { code: "8213", label: "60日新高", tone: "up" },
  { code: "8215", label: "60日大幅上涨", tone: "up" },
  { code: "8204", label: "加速下跌", tone: "down" },
  { code: "8203", label: "高台跳水", tone: "down" },
  { code: "8194", label: "大笔卖出", tone: "down" },
  { code: "8", label: "封跌停板", tone: "down" },
  { code: "16", label: "打开涨停板", tone: "down" },
  { code: "128", label: "有大卖盘", tone: "down" },
  { code: "8208", label: "竞价下跌", tone: "down" },
  { code: "8210", label: "低开5日线", tone: "down" },
  { code: "8212", label: "向下缺口", tone: "down" },
  { code: "8214", label: "60日新低", tone: "down" },
  { code: "8216", label: "60日大幅下跌", tone: "down" },
] as const;

export type ChangeTone = "down" | "up";

export type MarketChange = Readonly<{
  /** HH:MM:SS。 */
  at: string;
  code: string;
  /** 站内标的页地址；站内渲染不出来的为 null。 */
  href: string | null;
  /** 异动类型的中文名，例如「火箭发射」。 */
  label: string;
  name: string;
  tone: ChangeTone;
}>;

export type MarketChanges = Readonly<{
  rows: readonly MarketChange[];
  /** 上游报告的当日异动总条数。 */
  total: number | null;
}>;

/*
 * 键写成 string 而不是那 22 个字面量的联合：查表的入参是上游给的 t，
 * 认不认得正是要问的问题，不能先假定它一定是其中之一。
 */
const TYPE_BY_CODE = new Map<string, (typeof CHANGE_TYPES)[number]>(
  CHANGE_TYPES.map((entry) => [entry.code, entry]),
);

/**
 * `145654` → `14:56:54`，`92413` → `09:24:13`。
 *
 * 上游给的是不补零的整数：早盘的时间只有五位。直接按前两位切小时，
 * 09:24 会被读成 92 点。
 */
export const timeOfDay = (raw: unknown): string | null => {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
  const padded = String(raw).padStart(6, "0");
  if (padded.length !== 6) return null;
  const hour = padded.slice(0, 2);
  const minute = padded.slice(2, 4);
  const second = padded.slice(4, 6);
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    return null;
  }
  return `${hour}:${minute}:${second}`;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "https://quote.eastmoney.com/changes/",
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
 * 当日盘口异动，最新的在前；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天没有异动」，
 * 那是另一回事。
 */
export const loadMarketChanges = async (
  rows: number = MAX_CHANGE_ROWS,
): Promise<MarketChanges | null> => {
  const size =
    Number.isInteger(rows) && rows >= 1
      ? Math.min(rows, MAX_CHANGE_ROWS)
      : MAX_CHANGE_ROWS;

  /*
   * 查询串手写，不用 URLSearchParams——它会把类型之间的逗号编成 `%2C`，
   * 而上游对 `%2C` 的处理是只认第一个类型、其余静默丢掉：照常回 200，
   * 回来的是一张满屏「火箭发射」的表。当日 9910 条异动因此缩成 2097 条，
   * 页面上看不出任何异样。这几个值都是本文件里的常量，没有外部输入，
   * 不存在需要转义的内容。
   */
  const query = [
    `dpt=${DPT}`,
    "pageindex=0",
    `pagesize=${String(size)}`,
    `type=${CHANGE_TYPES.map((entry) => entry.code).join(",")}`,
    `ut=${UT}`,
  ].join("&");

  const payload = await fetchJson(`${ORIGIN}${PATH}?${query}`);
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  const raw = (data as Record<string, unknown>).allstock;
  if (!Array.isArray(raw)) return null;

  const parsed: MarketChange[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row.c === "string" ? row.c : "";
    const name = typeof row.n === "string" ? row.n : "";
    const at = timeOfDay(row.tm);
    const type = TYPE_BY_CODE.get(String(row.t));
    // 类型认不出来就丢掉：显示一条没说清是什么异动的记录，没有意义。
    if (code.length === 0 || name.length === 0 || at === null) continue;
    if (type === undefined) continue;

    // m：0 是深市、1 是沪市。
    const symbol = `${row.m === 1 ? "sh" : "sz"}${code}`;
    parsed.push({
      at,
      code,
      /*
       * 站内认不认这个代码，以 classifySymbol 为准。北交所的 92xxxx
       * 也会出现在异动里，而站内渲染不出来——照样给链接的话，
       * 那一行点得进去、点进去是 404。
       */
      href:
        /^\d{6}$/u.test(code) && classifySymbol(symbol) !== "other"
          ? `/instruments/${symbol}`
          : null,
      label: type.label,
      name,
      tone: type.tone,
    });
  }

  if (parsed.length === 0) return null;

  const total = (data as Record<string, unknown>).tc;
  return {
    rows: parsed,
    total: typeof total === "number" && Number.isFinite(total) ? total : null,
  };
};
