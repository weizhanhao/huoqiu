/*
 * 基金列表：按收益排名的真实公募基金。
 *
 * 基金中心此前列的是六只写死的基金（fund_syn_0001…），名字、收益、规模全是
 * 编的；而站内唯一一只真实基金（110011）从列表里根本走不到——它只在直接
 * 输入地址时才存在。右栏「热门基金」读的是同一份合成数据。
 *
 * 现在打天天基金的公开排行接口。返回的是一段 JSONP 形式的赋值语句，
 * 每一行用竖线分隔。列序不是猜的，用两个独立来源逐列对过：
 *   pingzhongdata 的 syl_1y / syl_3y / syl_6y / syl_1n
 *   f10/lsjz 的 FSRQ / DWJZ / JZZZL
 *
 * 列序（0 起）：
 *   0 代码  1 简称  2 类型  3 净值日期  4 单位净值  5 日增长率
 *   6 近1周  7 近1月  8 近3月  9 近6月  10 近1年  11 近2年  12 近3年
 *   13 今年来  14 成立来
 */

const ENDPOINT = "https://fundapi.eastmoney.com/fundtradenew.aspx";
/** 少了 Referer 上游直接拒绝。 */
const REFERER = "https://fund.eastmoney.com/data/fundranking.html";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

const COLUMN = {
  category: 2,
  code: 0,
  dayPct: 5,
  name: 1,
  nav: 4,
  navDate: 3,
  oneMonthPct: 7,
  oneYearPct: 10,
  sixMonthPct: 9,
  threeMonthPct: 8,
  threeYearPct: 12,
  yearToDatePct: 13,
} as const;

/*
 * 分类。
 *
 * 不提供「全部」：上游没有这样一个筛选，拿某一类代打的话，点「全部」看到的
 * 其实只是那一类，而界面上没有任何提示。
 */
const CATEGORY_FILTERS = {
  bond: "zq",
  hybrid: "hh",
  index: "zs",
  qdii: "qdii",
  stock: "gp",
} as const;

export type FundCategory = keyof typeof CATEGORY_FILTERS;

export const fundCategories = Object.keys(
  CATEGORY_FILTERS,
) as readonly FundCategory[];

export const isFundCategory = (value: string): value is FundCategory =>
  value in CATEGORY_FILTERS;

/** 排序依据，对应上游的 sc 参数。 */
const SORT_KEYS = {
  day: "rzdf",
  oneYear: "1n",
  threeYear: "3n",
  yearToDate: "jn",
} as const;

export type FundSort = keyof typeof SORT_KEYS;

export const fundSorts = Object.keys(SORT_KEYS) as readonly FundSort[];

export const isFundSort = (value: string): value is FundSort =>
  value in SORT_KEYS;

export type FundRow = Readonly<{
  /** 上游给的中文分类，例如「混合型」。 */
  category: string;
  code: string;
  dayPct: number | null;
  name: string;
  nav: number | null;
  /** 净值日期，YYYY-MM-DD。 */
  navDate: string;
  oneMonthPct: number | null;
  oneYearPct: number | null;
  sixMonthPct: number | null;
  threeMonthPct: number | null;
  threeYearPct: number | null;
  yearToDatePct: number | null;
}>;

export type FundList = Readonly<{
  page: number;
  rows: readonly FundRow[];
  /** 上游报告的总只数；拿不到时为 null，页面据此不显示总数。 */
  total: number | null;
}>;

/** 一页多少只。 */
export const FUND_PAGE_SIZE = 20;
/** 上游排行最多翻到这里；再往后没有意义也没人看。 */
const MAX_PAGE = 100;

const numeric = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  /*
   * 空串是「这只基金没有这个值」——成立不满一年的基金没有近一年收益。
   * 当成 0 会让它在收益榜上排进中游，看起来像一只不赚不赔的基金。
   */
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Referer: REFERER, "User-Agent": "Mozilla/5.0" },
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
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 从 `var rankData = {datas:[...],allRecords:123,...};` 里取出那一串行。
 *
 * 不用 JSON.parse：上游给的是 JS 赋值语句，键名没有引号，不是合法 JSON。
 * 也不用 eval——那等于让上游在本进程里执行任意代码。
 */
export const parseRankData = (
  body: string,
): { rows: readonly string[]; total: number | null } | null => {
  const start = body.indexOf("datas:[");
  if (start === -1) return null;
  const open = body.indexOf("[", start);
  const close = body.indexOf("]", open);
  if (open === -1 || close === -1) return null;

  /*
   * 按引号段取，不按逗号切。
   *
   * 行与行之间确实是逗号分隔，但基金简称里也可能有逗号——按逗号硬切的话，
   * 那一只会被劈成两半：前半段代码对不上被丢掉，后半段成了一行没有代码的
   * 垃圾数据，而列表上只是少了一只，看不出哪里不对。
   */
  const rows = [...body.slice(open + 1, close).matchAll(/"([^"]*)"/gu)]
    .map((match) => match[1] ?? "")
    .filter((entry) => entry.length > 0);

  const totalMatch = /allRecords:\s*(\d+)/u.exec(body);
  const total = totalMatch === null ? null : Number(totalMatch[1]);

  return {
    rows,
    total: total !== null && Number.isFinite(total) ? total : null,
  };
};

const toRow = (raw: string): FundRow | null => {
  const cells = raw.split("|");
  const code = cells[COLUMN.code]?.trim() ?? "";
  const name = cells[COLUMN.name]?.trim() ?? "";
  // 代码和名字缺一个，这一行既没法展示也没法点进去。
  if (!/^\d{6}$/u.test(code) || name.length === 0) return null;

  return {
    category: cells[COLUMN.category]?.trim() ?? "",
    code,
    dayPct: numeric(cells[COLUMN.dayPct]),
    name,
    nav: numeric(cells[COLUMN.nav]),
    navDate: cells[COLUMN.navDate]?.trim() ?? "",
    oneMonthPct: numeric(cells[COLUMN.oneMonthPct]),
    oneYearPct: numeric(cells[COLUMN.oneYearPct]),
    sixMonthPct: numeric(cells[COLUMN.sixMonthPct]),
    threeMonthPct: numeric(cells[COLUMN.threeMonthPct]),
    threeYearPct: numeric(cells[COLUMN.threeYearPct]),
    yearToDatePct: numeric(cells[COLUMN.yearToDatePct]),
  };
};

export type LoadFundListInput = Readonly<{
  category: FundCategory;
  page?: number;
  size?: number;
  sort?: FundSort;
}>;

/**
 * 某个分类下按指定口径排名的基金；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「这个分类下没有基金」，
 * 那是另一回事。
 */
export const loadFundList = async ({
  category,
  page = 1,
  size = FUND_PAGE_SIZE,
  sort = "oneYear",
}: LoadFundListInput): Promise<FundList | null> => {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;
  if (!Number.isInteger(size) || size < 1 || size > FUND_PAGE_SIZE) return null;

  const query = new URLSearchParams({
    ft: CATEGORY_FILTERS[category],
    pi: String(page),
    pn: String(size),
    sc: SORT_KEYS[sort],
    st: "desc",
  });

  const body = await fetchText(`${ENDPOINT}?${query.toString()}`);
  if (body === null) return null;

  const parsed = parseRankData(body);
  if (parsed === null) return null;

  const rows = parsed.rows
    .map((raw) => toRow(raw))
    .filter((row): row is FundRow => row !== null);
  if (rows.length === 0) return null;

  return { page, rows, total: parsed.total };
};
