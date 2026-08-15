import { classifySymbol } from "../lib/symbol-category";

/*
 * ETF 列表。
 *
 * ETF 中心此前列的是九只虚构 ETF（etf_syn_0001…），代码、净值、规模全是编的，
 * 而站内其实已经能渲染真实 ETF 的行情与日线（/instruments/sh510300）——
 * 也就是说这一栏通向的内容全假，真的那一份反而没有入口。
 *
 * 现在打东方财富的公开行情列表接口，`b:MK0021…MK0024` 是 ETF 的板块串。
 * 排序和分页都由上游做：只把本页重排，得到的是「这 20 只里的顺序」，
 * 却会被读成「全市场成交额最大的 20 只」。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 有些网络环境到 push2 不通，延时源仍可用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";
const PATH = "/api/qt/clist/get";
const FIELDS = "f2,f3,f4,f5,f6,f12,f13,f14,f18";
/** ETF 的四个板块串，缺一块那一类就永远不出现。 */
const ETF_FILTER = "b:MK0021,b:MK0022,b:MK0023,b:MK0024";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;

/** 一页多少只。 */
export const ETF_PAGE_SIZE = 20;
const MAX_PAGE = 80;

/** 排序依据，对应上游的 fid。 */
const SORT_FIELDS = {
  amount: "f6",
  change: "f3",
  volume: "f5",
} as const;

export type EtfSort = keyof typeof SORT_FIELDS;

export const isEtfSort = (value: string): value is EtfSort =>
  value in SORT_FIELDS;

export type EtfRow = Readonly<{
  /** 元。 */
  amount: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  code: string;
  /** 站内标的页地址；站内渲染不出来的为 null。 */
  href: string | null;
  last: number | null;
  name: string;
  prevClose: number | null;
  /** 手。上游 f5 给的就是手，不是股。 */
  volumeHands: number | null;
}>;

export type EtfList = Readonly<{
  /** 走的是延时源时为 true，页面据此如实标注。 */
  delayed: boolean;
  page: number;
  rows: readonly EtfRow[];
  total: number | null;
}>;

const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // "-" 是「这只没有这个值」，不是 0。
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/*
 * 上游的 diff 有两种形状：有时是数组，有时是以 "0"、"1" 为键的对象。
 * 只处理数组的话，返回对象的那些请求会得到一份空列表——
 * 而页面上看起来就像今天没有 ETF 在交易。
 */
const rowsOf = (diff: unknown): readonly unknown[] => {
  if (Array.isArray(diff)) return diff;
  if (typeof diff === "object" && diff !== null) {
    return Object.values(diff as Record<string, unknown>);
  }
  return [];
};

export type LoadEtfListInput = Readonly<{
  page?: number;
  sort?: EtfSort;
}>;

/**
 * ETF 列表；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天没有 ETF」，
 * 那是另一回事。
 */
export const loadEtfList = async ({
  page = 1,
  sort = "amount",
}: LoadEtfListInput = {}): Promise<EtfList | null> => {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;

  const parameters = new URLSearchParams({
    fid: SORT_FIELDS[sort],
    fields: FIELDS,
    fs: ETF_FILTER,
    // 不带这个参数，上游回的是整数编码，价格会差一千倍。
    fltt: "2",
    pn: String(page),
    po: "1",
    pz: String(ETF_PAGE_SIZE),
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

  const rows: EtfRow[] = [];
  for (const entry of rowsOf((data as Record<string, unknown>).diff)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row.f12 === "string" ? row.f12 : "";
    const name = typeof row.f14 === "string" ? row.f14 : "";
    if (!/^\d{6}$/u.test(code) || name.length === 0) continue;

    // f13：1 是沪市，0 是深市。
    const symbol = `${row.f13 === 1 ? "sh" : "sz"}${code}`;
    rows.push({
      amount: numeric(row.f6),
      changeAmount: numeric(row.f4),
      changePercent: numeric(row.f3),
      code,
      /*
       * 站内认不认这个代码，以 classifySymbol 为准。认不出来还照样给链接的话，
       * 每一行都点得进去、每一次都是空页——先许诺再落空，比不给链接更糟。
       */
      href:
        classifySymbol(symbol) === "other" ? null : `/instruments/${symbol}`,
      last: numeric(row.f2),
      name,
      prevClose: numeric(row.f18),
      volumeHands: numeric(row.f5),
    });
  }

  if (rows.length === 0) return null;

  const total = numeric((data as Record<string, unknown>).total);
  return { delayed, page, rows, total };
};
