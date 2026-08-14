import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 公司资料（F10）。
 *
 * 来源：东方财富公开 F10 接口，免费、无需鉴权、返回 UTF-8 JSON，已实测可用：
 *   https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=SZ300862
 *
 * 上游一次返回两段：jbzl（基本资料）与 fxxg（发行相关）。字段名是它自己的
 * 大写下划线命名，这里翻成页面直接能用的形状，并且——
 *
 * 缺就是缺。上游没给的字段一律 null，不补空串、不填「暂无」、不拿别的字段顶上。
 * 空串会在页面上渲染成一个「有这一项但内容为空」的行，看起来像公司真的没有官网；
 * null 才能让页面选择不显示这一项。
 */

const PROFILE_ORIGIN = "https://emweb.securities.eastmoney.com";
const PROFILE_PATH = "/PC_HSF10/CompanySurvey/PageAjax";

/** 沪深六位代码，带 sh/sz 前缀。别的形态一律不发请求。 */
const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

/*
 * 公司资料一年也未必变一次，缓存给到一天。
 * 这一层同时是对上游的礼貌——同一只股票被反复打开时不会每次都去打人家接口。
 */
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export type CompanyProfile = Readonly<{
  address: string | null;
  businessScope: string | null;
  chineseName: string | null;
  employees: number | null;
  englishName: string | null;
  fetchedAt: string;
  foundedOn: string | null;
  industry: string | null;
  issuePrice: number | null;
  legalPerson: string | null;
  listedOn: string | null;
  market: string | null;
  phone: string | null;
  profile: string | null;
  province: string | null;
  raisedFunds: number | null;
  registeredAddress: string | null;
  registeredCapital: number | null;
  secretary: string | null;
  securityType: string | null;
  shortName: string | null;
  symbol: string;
  website: string | null;
}>;

/*
 * 缓存结构版本。
 *
 * 加过一次字段之后踩过坑：给 shareStructure 补了 topFloatShares /
 * topFloatRatio 两项，但磁盘上那些**加字段之前**写下的缓存在 TTL 内
 * 仍被判定为「新鲜」，于是旧结构被原样回灌到页面——20.3% 的股本
 * 就那样凭空消失了整整半天，而页面看起来一切正常。
 *
 * 所以：**任何时候改动这些类型的字段，都要把这个数字 +1。**
 * 版本不符的缓存一律当作没有，重新取。
 */
const CACHE_SCHEMA = 1;

interface Versioned {
  schema?: number;
}

const cacheDirectory = (): string =>
  resolve(
    process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance/instruments"),
    "f10",
  );

const cachePath = (symbol: string, kind: string): string =>
  resolve(cacheDirectory(), `${symbol}-${kind}.json`);

const readCache = <T>(symbol: string, kind: string): T | null => {
  try {
    const parsed = JSON.parse(
      readFileSync(cachePath(symbol, kind), "utf8"),
    ) as T & Versioned;
    // 结构变过就当没缓存——旧结构回灌到页面上是看不出来的。
    if (parsed.schema !== CACHE_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (symbol: string, kind: string, value: unknown): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = cachePath(symbol, kind);
    const temporary = `${target}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify({ ...(value as object), schema: CACHE_SCHEMA }, null, 2)}\n`,
      "utf8",
    );
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果，下次重新取即可。
  }
};

const isFresh = (iso: string, ttlMs: number): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp < ttlMs;
};

/** 东财 code 参数用大写带市场前缀：sz300862 → SZ300862。 */
const upstreamCode = (symbol: string): string => symbol.toUpperCase();

/** 新浪 F10 用的是不带市场前缀的六位代码：sz300862 → 300862。 */
const bareSymbol = (symbol: string): string => symbol.slice(2);

/** 取原始字节；GBK 页面不能先当成字符串读，否则中文已经烂在解码那一步。 */
const fetchBytes = async (url: string): Promise<Buffer | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // 上游异常返回一个巨大响应时不把它读进内存。
    return buffer.byteLength > MAX_BYTES ? null : buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    const body = await response.text();
    // 上游异常返回一个巨大响应时不把它解析进内存。
    if (body.length > MAX_BYTES) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** 空、空白、null 一律当作「上游没给」。 */
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** 上游日期形如 "2020-08-24 00:00:00"，页面要的是日期而不是半截时间戳。 */
const dateOnly = (value: unknown): string | null => {
  const raw = text(value);
  if (raw === null) return null;
  const day = raw.slice(0, 10);
  return DATE_PATTERN.test(day) ? day : null;
};

const firstRow = (value: unknown): Record<string, unknown> | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const row: unknown = value[0];
  return typeof row === "object" && row !== null
    ? (row as Record<string, unknown>)
    : null;
};

/**
 * 取一只标的的公司资料；拿不到返回 null。
 *
 * 缓存新鲜就直接用；上游临时挂掉时退回上一次的好数据，不回落到样本。
 */
export const loadCompanyProfile = async (
  rawSymbol: string,
): Promise<CompanyProfile | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache<CompanyProfile>(symbol, "profile");
  if (cached !== null && isFresh(cached.fetchedAt, PROFILE_TTL_MS)) {
    return cached;
  }

  const payload = await fetchJson(
    `${PROFILE_ORIGIN}${PROFILE_PATH}?code=${upstreamCode(symbol)}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const body = payload as Record<string, unknown>;
  const basic = firstRow(body.jbzl);
  /*
   * jbzl 为空说明这个代码在上游查不到，
   * 不是「查到了一家没有名字的公司」——这时不该产出一条全 null 的记录。
   */
  if (basic === null) return cached;
  const issue = firstRow(body.fxxg) ?? {};

  const profile: CompanyProfile = {
    address: text(basic.ADDRESS),
    businessScope: text(basic.BUSINESS_SCOPE),
    chineseName: text(basic.ORG_NAME),
    employees: numeric(basic.EMP_NUM),
    englishName: text(basic.ORG_NAME_EN),
    fetchedAt: new Date().toISOString(),
    foundedOn: dateOnly(issue.FOUND_DATE),
    industry: text(basic.EM2016),
    issuePrice: numeric(issue.ISSUE_PRICE),
    legalPerson: text(basic.LEGAL_PERSON),
    listedOn: dateOnly(issue.LISTING_DATE),
    market: text(basic.TRADE_MARKET),
    phone: text(basic.ORG_TEL),
    profile: text(basic.ORG_PROFILE),
    province: text(basic.PROVINCE),
    raisedFunds: numeric(issue.TOTAL_FUNDS),
    registeredAddress: text(basic.REG_ADDRESS),
    registeredCapital: numeric(basic.REG_CAPITAL),
    secretary: text(basic.SECRETARY),
    securityType: text(basic.SECURITY_TYPE),
    shortName: text(basic.SECURITY_NAME_ABBR),
    symbol,
    website: text(basic.ORG_WEB),
  };
  writeCache(symbol, "profile", profile);
  return profile;
};

/*
 * 股权信息。
 *
 * 来源：东方财富公开 F10 接口，免费、无需鉴权、返回 UTF-8 JSON，已实测可用：
 *   https://emweb.securities.eastmoney.com/PC_HSF10/ShareholderResearch/PageAjax?code=SZ300862
 *
 * 一次调用同时给出股东人数、十大股东、十大流通股东、基金持股、股本结构、
 * 实际控制人、限售解禁——股权信息那一组的六个分区页共用这一份，
 * 所以只打一次接口、只缓存一份。
 *
 * 量纲是核对过的：股数为股，比例为百分数，金额为元，股东人数为户。
 */
const SHAREHOLDER_PATH = "/PC_HSF10/ShareholderResearch/PageAjax";

/* 股东数据按季度或月度披露，缓存给到半天。 */
const SHAREHOLDER_TTL_MS = 12 * 60 * 60 * 1000;

export type HolderCount = Readonly<{
  averageHoldAmount: number | null;
  averageShares: number | null;
  changeRatio: number | null;
  endedOn: string | null;
  focus: string | null;
  total: number | null;
}>;

export type TopHolder = Readonly<{
  change: string | null;
  endedOn: string | null;
  holderType?: string | null;
  name: string | null;
  rank: number | null;
  ratio: number | null;
  shares: number | null;
  sharesType?: string | null;
}>;

export type FundHolding = Readonly<{
  fundCode: string | null;
  name: string | null;
  ratio: number | null;
  reportedOn: string | null;
  shares: number | null;
  value: number | null;
}>;

/*
 * 股本结构。
 *
 * 上游的 ltgf 段是**三分**的，不是两分——实测三个比例相加 99.99%：
 *   LIMITED_SHARES        / LIMITED_SHARES_RATIO    限售流通股      17.95%
 *   HOLD_NUM_COUNT        / HOLD_NUM_RATIO          十大流通股东持股 20.30%
 *   OTHER_UNLIMITED_SHARES/ UNLIMITED_SHARES_RATIO  其余无限售流通股 61.74%
 *
 * 而且 HOLD_NUM_COUNT 与十大流通股东持股之和逐股相等（37,479,934）。
 * 也就是说 OTHER_UNLIMITED_SHARES 是「扣除十大流通股东之后」的部分。
 * 早先把它当成全部无限售流通股，页面上 20.3% 的股本就凭空消失了，
 * 两行相加只有 79.69%，读者会以为我们算漏了。
 */
export type ShareStructure = Readonly<{
  endedOn: string | null;
  limitedRatio: number | null;
  limitedShares: number | null;
  /** 十大流通股东持股。 */
  topFloatRatio: number | null;
  topFloatShares: number | null;
  /** 扣除十大流通股东后的其余无限售流通股。 */
  unlimitedRatio: number | null;
  unlimitedShares: number | null;
}>;

/*
 * 限售解禁。
 *
 * 字段名是拿一只确实有解禁安排的股票打接口看出来的，不是猜的——
 * 猜的那一版（FREE_DATE / FREE_SHARES_NUM / FREE_SHARES_TYPE）全错，
 * 而当时的样例股票 xsjj 是空数组，错得完全看不出来。
 */
export type Lockup = Readonly<{
  ratio: number | null;
  releasedOn: string | null;
  shares: number | null;
  type: string | null;
}>;

export type Shareholders = Readonly<{
  controller: Readonly<{ name: string | null; ratio: number | null }> | null;
  fetchedAt: string;
  fundHoldings: readonly FundHolding[];
  holderCounts: readonly HolderCount[];
  lockups: readonly Lockup[];
  shareStructure: ShareStructure | null;
  symbol: string;
  topFloatHolders: readonly TopHolder[];
  topHolders: readonly TopHolder[];
}>;

const rows = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];

/**
 * 取一只标的的股权信息；拿不到返回 null。
 *
 * 注意「没有」和「取不到」是两回事：上游给了 xsjj: [] 表示这只股票当前
 * 确实没有限售解禁安排，那是一个确定的答案，页面据此说「当前无解禁安排」。
 * 只有整份payload都没拿到时才返回 null。
 */
export const loadShareholders = async (
  rawSymbol: string,
): Promise<Shareholders | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache<Shareholders>(symbol, "shareholders");
  if (cached !== null && isFresh(cached.fetchedAt, SHAREHOLDER_TTL_MS)) {
    return cached;
  }

  const payload = await fetchJson(
    `${PROFILE_ORIGIN}${SHAREHOLDER_PATH}?code=${upstreamCode(symbol)}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;
  const body = payload as Record<string, unknown>;

  const structureRow = rows(body.ltgf)[0];
  const controllerRow = rows(body.sjkzr)[0];

  const shareholders: Shareholders = {
    controller:
      controllerRow === undefined
        ? null
        : {
            name: text(controllerRow.HOLDER_NAME),
            ratio: numeric(controllerRow.HOLD_RATIO),
          },
    fetchedAt: new Date().toISOString(),
    fundHoldings: rows(body.jjcg).map((row) => ({
      fundCode: text(row.FUND_CODE),
      name: text(row.HOLDER_NAME),
      ratio: numeric(row.TOTALSHARES_RATIO),
      reportedOn: dateOnly(row.REPORT_DATE),
      shares: numeric(row.TOTAL_SHARES),
      value: numeric(row.HOLD_VALUE),
    })),
    holderCounts: rows(body.gdrs).map((row) => ({
      averageHoldAmount: numeric(row.AVG_HOLD_AMT),
      averageShares: numeric(row.AVG_FREE_SHARES),
      changeRatio: numeric(row.TOTAL_NUM_RATIO),
      endedOn: dateOnly(row.END_DATE),
      focus: text(row.HOLD_FOCUS),
      total: numeric(row.HOLDER_TOTAL_NUM),
    })),
    lockups: rows(body.xsjj).map((row) => ({
      ratio: numeric(row.TOTAL_SHARES_RATIO),
      releasedOn: dateOnly(row.LIFT_DATE),
      shares: numeric(row.LIFT_NUM),
      type: text(row.LIFT_TYPE),
    })),
    shareStructure:
      structureRow === undefined
        ? null
        : {
            endedOn: dateOnly(structureRow.END_DATE),
            limitedRatio: numeric(structureRow.LIMITED_SHARES_RATIO),
            limitedShares: numeric(structureRow.LIMITED_SHARES),
            topFloatRatio: numeric(structureRow.HOLD_NUM_RATIO),
            topFloatShares: numeric(structureRow.HOLD_NUM_COUNT),
            unlimitedRatio: numeric(structureRow.UNLIMITED_SHARES_RATIO),
            unlimitedShares: numeric(structureRow.OTHER_UNLIMITED_SHARES),
          },
    symbol,
    topFloatHolders: rows(body.sdltgd).map((row) => ({
      change: text(row.HOLD_NUM_CHANGE),
      endedOn: dateOnly(row.END_DATE),
      holderType: text(row.HOLDER_TYPE),
      name: text(row.HOLDER_NAME),
      rank: numeric(row.HOLDER_RANK),
      ratio: numeric(row.FREE_HOLDNUM_RATIO),
      shares: numeric(row.HOLD_NUM),
    })),
    topHolders: rows(body.sdgd).map((row) => ({
      change: text(row.HOLD_NUM_CHANGE),
      endedOn: dateOnly(row.END_DATE),
      name: text(row.HOLDER_NAME),
      rank: numeric(row.HOLDER_RANK),
      ratio: numeric(row.HOLD_NUM_RATIO),
      shares: numeric(row.HOLD_NUM),
      sharesType: text(row.SHARES_TYPE),
    })),
  };

  /*
   * 一项都没有，说明这个代码在上游查不到或结构变了——
   * 不该产出一份全空的记录让页面显示成「这家公司没有任何股东」。
   */
  if (
    shareholders.holderCounts.length === 0 &&
    shareholders.topHolders.length === 0 &&
    shareholders.topFloatHolders.length === 0 &&
    shareholders.shareStructure === null
  ) {
    return cached;
  }

  writeCache(symbol, "shareholders", shareholders);
  return shareholders;
};

/*
 * 高管增减持。
 *
 * 来源：东方财富数据中心的公开接口，免费、无需鉴权，已实测可用：
 *   https://datacenter-web.eastmoney.com/api/data/v1/get
 *     ?reportName=RPT_EXECUTIVE_HOLD_DETAILS&filter=(SECURITY_CODE="300862")
 *
 * CHANGE_SHARES 的正负号就是「增持」和「减持」的全部区别，绝不取绝对值——
 * 那等于在人名旁边写一件与披露相反的事。
 */
const DATACENTER_ORIGIN = "https://datacenter-web.eastmoney.com";
const DATACENTER_PATH = "/api/data/v1/get";
const INSIDER_REPORT = "RPT_EXECUTIVE_HOLD_DETAILS";
const INSIDER_PAGE_SIZE = 50;

/* 增减持按公告披露，一天内重复打开同一只股票不必反复取。 */
const INSIDER_TTL_MS = 12 * 60 * 60 * 1000;

export type InsiderTrade = Readonly<{
  amount: number | null;
  averagePrice: number | null;
  changedOn: string | null;
  heldAfter: number | null;
  name: string | null;
  position: string | null;
  ratio: number | null;
  reason: string | null;
  relation: string | null;
  /** 负数为减持。 */
  shares: number | null;
}>;

export type InsiderTrades = Readonly<{
  fetchedAt: string;
  symbol: string;
  trades: readonly InsiderTrade[];
}>;

/**
 * 取一只标的的高管增减持记录；拿不到返回 null。
 *
 * 空列表是「本期没有披露的增减持」，是一个确定的答案，不是失败。
 */
export const loadInsiderTrades = async (
  rawSymbol: string,
): Promise<InsiderTrades | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache<InsiderTrades>(symbol, "insider");
  if (cached !== null && isFresh(cached.fetchedAt, INSIDER_TTL_MS)) {
    return cached;
  }

  const query = new URLSearchParams({
    columns: "ALL",
    filter: `(SECURITY_CODE="${bareSymbol(symbol)}")`,
    pageSize: String(INSIDER_PAGE_SIZE),
    reportName: INSIDER_REPORT,
    sortColumns: "CHANGE_DATE",
    sortTypes: "-1",
  });
  const payload = await fetchJson(
    `${DATACENTER_ORIGIN}${DATACENTER_PATH}?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const result = (payload as Record<string, unknown>).result;
  if (typeof result !== "object" || result === null) return cached;

  const insider: InsiderTrades = {
    fetchedAt: new Date().toISOString(),
    symbol,
    trades: rows((result as Record<string, unknown>).data).map((row) => ({
      amount: numeric(row.CHANGE_AMOUNT),
      averagePrice: numeric(row.AVERAGE_PRICE),
      changedOn: dateOnly(row.CHANGE_DATE),
      heldAfter: numeric(row.END_HOLD_NUM),
      name: text(row.PERSON_NAME),
      position: text(row.POSITION_NAME),
      ratio: numeric(row.CHANGE_RATIO),
      reason: text(row.CHANGE_REASON),
      relation: text(row.PERSON_DSE_RELATION),
      // 原样保留符号：负数是减持。
      shares: numeric(row.CHANGE_SHARES),
    })),
  };
  writeCache(symbol, "insider", insider);
  return insider;
};

/*
 * 高管名单。
 *
 * 来源：新浪财经 F10 的公开页面，免费、无需鉴权、已实测可用：
 *   https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpManager/stockid/300862.phtml
 *
 * 页面按固定顺序给出三张表：Table1 公司高管、Table2 历届董事会成员、
 * Table3 历届监事会成员；每张表四列：姓 名 / 职 务 / 起始日期 / 终止日期。
 * 返回的是 GBK，得按字节取回来再解码，不能先当字符串读。
 */
const EXECUTIVES_ORIGIN = "https://vip.stock.finance.sina.com.cn";
const EXECUTIVES_PATH = "/corp/go.php/vCI_CorpManager/stockid";

/** 三张表的含义由页面结构固定，顺序即语义。 */
const EXECUTIVE_TABLES: readonly Readonly<{ id: string; title: string }>[] = [
  { id: "Table1", title: "公司高管" },
  { id: "Table2", title: "历届董事会成员" },
  { id: "Table3", title: "历届监事会成员" },
];

/* 高管变动不频繁，但比公司资料活跃，缓存给到半天。 */
const EXECUTIVES_TTL_MS = 12 * 60 * 60 * 1000;

export type ExecutiveMember = Readonly<{
  endedOn: string | null;
  name: string;
  role: string;
  startedOn: string | null;
}>;

export type ExecutiveGroup = Readonly<{
  members: readonly ExecutiveMember[];
  title: string;
}>;

export type CompanyExecutives = Readonly<{
  fetchedAt: string;
  groups: readonly ExecutiveGroup[];
  symbol: string;
}>;

/** 去标签、还原 &nbsp;、压掉多余空白。表头「姓 名」中间那个空格也一并去掉。 */
const cellText = (raw: string): string =>
  raw
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

/**
 * 表格里的日期。
 *
 * 在任者的终止日期是「--」，那不是一个日期，也不该被当成空字符串塞进页面——
 * 它的意思是「还在任」，由调用方决定怎么表达。
 */
const tableDate = (raw: string): string | null =>
  DATE_PATTERN.test(raw) ? raw : null;

const parseExecutiveTable = (
  html: string,
  id: string,
): readonly ExecutiveMember[] | null => {
  const table = new RegExp(
    `<table[^>]*id="${id}"[\\s\\S]*?</table>`,
    "u",
  ).exec(html);
  if (table === null) return null;

  const members: ExecutiveMember[] = [];
  for (const match of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)) {
    const rowHtml = match[1];
    if (rowHtml === undefined) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gu)]
      .map((cell) => cellText(cell[1] ?? ""))
      .slice(0, 4);
    const [name, role, started, ended] = cells;
    if (
      name === undefined ||
      role === undefined ||
      started === undefined ||
      ended === undefined
    ) {
      continue;
    }
    /*
     * 表头也是一行 tr，它的第三列不是日期。用「起始日期解析得出来」当作
     * 「这是一行数据」的判据，比按行号跳过第一行稳——页面加一行说明文字
     * 就会把行号偏移，而那种偏移在界面上看不出来。
     */
    if (tableDate(started) === null) continue;
    if (name.length === 0 || role.length === 0) continue;

    members.push({
      endedOn: tableDate(ended),
      name,
      role,
      startedOn: tableDate(started),
    });
  }
  return members;
};

/**
 * 取一只标的的高管名单；拿不到返回 null。
 *
 * 页面结构变了就承认拿不到，不产出一份空名单假装这家公司没有高管。
 */
export const loadCompanyExecutives = async (
  rawSymbol: string,
): Promise<CompanyExecutives | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache<CompanyExecutives>(symbol, "executives");
  if (cached !== null && isFresh(cached.fetchedAt, EXECUTIVES_TTL_MS)) {
    return cached;
  }

  const buffer = await fetchBytes(
    `${EXECUTIVES_ORIGIN}${EXECUTIVES_PATH}/${bareSymbol(symbol)}.phtml`,
  );
  if (buffer === null) return cached;

  let html: string;
  try {
    // 页面是 GBK，用 UTF-8 解会把所有人名变成乱码。
    html = new TextDecoder("gbk").decode(buffer);
  } catch {
    return cached;
  }

  const groups: ExecutiveGroup[] = [];
  for (const { id, title } of EXECUTIVE_TABLES) {
    const members = parseExecutiveTable(html, id);
    if (members === null || members.length === 0) continue;
    groups.push({ members, title });
  }
  // 一张表都认不出来，说明页面结构变了，这时报「拿不到」而不是报「没有高管」。
  if (groups.length === 0) return cached;

  const executives: CompanyExecutives = {
    fetchedAt: new Date().toISOString(),
    groups,
    symbol,
  };
  writeCache(symbol, "executives", executives);
  return executives;
};
