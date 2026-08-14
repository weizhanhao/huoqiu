import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 基金详情。
 *
 * 两个免费公开接口，均已实测可用：
 *   基金概况 https://datacenter-web.eastmoney.com/api/data/v1/get
 *            ?reportName=RPT_FUND_RANK&filter=(SECURITY_CODE="110022")
 *   净值历史 https://api.fund.eastmoney.com/f10/lsjz?fundCode=110022
 *
 * 净值接口校验来源，缺了 Referer 会被拒。那种情况下概况还是好的、只有净值
 * 那一段空着——页面上看起来像「这只基金没有净值数据」，所以这个头不能省。
 *
 * 两边的数据是交叉对过的：概况的 PER_NAV 2.95 与净值历史首行的 DWJZ 2.9500
 * 相符，CHANGE -0.1 与 JZZZL -0.10 相符。
 * 量纲：净值元、规模元、各期收益率与费率为百分数。
 */

const PROFILE_ORIGIN = "https://datacenter-web.eastmoney.com";
const PROFILE_PATH = "/api/data/v1/get";
const NAV_ORIGIN = "https://api.fund.eastmoney.com";
const NAV_PATH = "/f10/lsjz";
/** 净值接口校验来源，缺了直接被拒。 */
const NAV_REFERER = "https://fundf10.eastmoney.com/";

/** 基金代码是六位数字，不带市场前缀。 */
const CODE_PATTERN = /^\d{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
/** 净值取最近这么多个交易日，够看一段走势又不至于把页面撑爆。 */
const NAV_COUNT = 60;
/** 净值一天一更，缓存半天。 */
const TTL_MS = 12 * 60 * 60 * 1000;

export type FundNavEntry = Readonly<{
  accumulated: number | null;
  /** 百分数。 */
  changePercent: number | null;
  date: string | null;
  netValue: number | null;
  purchaseState: string | null;
  redeemState: string | null;
}>;

export type Fund = Readonly<{
  /** 百分数。 */
  applyRate: number | null;
  changeMonth3: number | null;
  changePercent: number | null;
  changeYear: number | null;
  code: string;
  fetchedAt: string;
  kind: string | null;
  manager: string | null;
  name: string | null;
  navHistory: readonly FundNavEntry[];
  netValue: number | null;
  netValueOn: string | null;
  /** 元。 */
  scale: number | null;
  startedOn: string | null;
}>;

const cacheDirectory = (): string =>
  resolve(
    process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance/instruments"),
    "funds",
  );

const cachePath = (code: string): string =>
  resolve(cacheDirectory(), `${code}.json`);

const readCache = (code: string): Fund | null => {
  try {
    return JSON.parse(readFileSync(cachePath(code), "utf8")) as Fund;
  } catch {
    return null;
  }
};

const writeCache = (fund: Fund): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = cachePath(fund.code);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(fund, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果。
  }
};

const isFresh = (iso: string): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp < TTL_MS;
};

const fetchJson = async (
  url: string,
  headers: Record<string, string>,
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > MAX_BYTES) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** 净值接口把数字当字符串给（"2.9500"），概况接口给的是数字。 */
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = text(value);
  if (raw === null || raw === "-") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateOnly = (value: unknown): string | null => {
  const raw = text(value);
  if (raw === null) return null;
  const day = raw.slice(0, 10);
  return DATE_PATTERN.test(day) ? day : null;
};

const rows = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];

/**
 * 取一只基金的详情；拿不到返回 null。
 *
 * 概况查不到就是没有这只基金——不产出一条只有净值的半截记录。
 * 反过来，净值历史挂了不等于基金没了：概况照常给，净值列表为空，
 * 由页面说明这一段取不到。
 */
export const loadFund = async (rawCode: string): Promise<Fund | null> => {
  const code = rawCode.trim();
  if (!CODE_PATTERN.test(code)) return null;

  const cached = readCache(code);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const profileQuery = new URLSearchParams({
    columns: "ALL",
    filter: `(SECURITY_CODE="${code}")`,
    pageSize: "1",
    reportName: "RPT_FUND_RANK",
  });
  const navQuery = new URLSearchParams({
    fundCode: code,
    pageIndex: "1",
    pageSize: String(NAV_COUNT),
  });

  const [profilePayload, navPayload] = await Promise.all([
    fetchJson(
      `${PROFILE_ORIGIN}${PROFILE_PATH}?${profileQuery.toString()}`,
      {},
    ),
    fetchJson(`${NAV_ORIGIN}${NAV_PATH}?${navQuery.toString()}`, {
      Referer: NAV_REFERER,
    }),
  ]);

  const result =
    typeof profilePayload === "object" && profilePayload !== null
      ? (profilePayload as Record<string, unknown>).result
      : null;
  const profileRow =
    typeof result === "object" && result !== null
      ? rows((result as Record<string, unknown>).data)[0]
      : undefined;
  // 概况查不到就是没有这只基金。
  if (profileRow === undefined) return cached;

  const navData =
    typeof navPayload === "object" && navPayload !== null
      ? (navPayload as Record<string, unknown>).Data
      : null;
  const navRows =
    typeof navData === "object" && navData !== null
      ? rows((navData as Record<string, unknown>).LSJZList)
      : [];

  const fund: Fund = {
    applyRate: numeric(profileRow.APPLY_RATE),
    changeMonth3: numeric(profileRow.CHANGE_3MONTHS),
    changePercent: numeric(profileRow.CHANGE),
    changeYear: numeric(profileRow.CHANGE_YEAR),
    code,
    fetchedAt: new Date().toISOString(),
    kind: text(profileRow.STOCKTYPE) ?? text(profileRow.FUND_TYPE),
    manager: text(profileRow.ORG_NAME),
    name: text(profileRow.FUND_NAME),
    navHistory: navRows.map((row) => ({
      accumulated: numeric(row.LJJZ),
      changePercent: numeric(row.JZZZL),
      date: dateOnly(row.FSRQ),
      netValue: numeric(row.DWJZ),
      purchaseState: text(row.SGZT),
      redeemState: text(row.SHZT),
    })),
    netValue: numeric(profileRow.PER_NAV),
    netValueOn: dateOnly(profileRow.NAV_DATE),
    scale: numeric(profileRow.FUND_SCALE),
    startedOn: dateOnly(profileRow.START_DATE),
  };
  writeCache(fund);
  return fund;
};
