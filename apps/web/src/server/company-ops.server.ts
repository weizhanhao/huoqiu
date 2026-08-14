import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 公司运作、股票交易与公告。
 *
 * 三个东方财富公开接口（免费、无需鉴权，均已实测可用）：
 *   PC_HSF10/OperationsRequired/PageAjax  大事提醒 dstx / 大宗交易 dzjy
 *                                          / 龙虎榜 lhbd / 融资融券 rzrq
 *   PC_HSF10/BusinessAnalysis/PageAjax    主营构成 zygcfx
 *   PC_HSF10/BonusFinancing/PageAjax      分红送配 fhyx / 增发明细 zfmx
 * 外加公告列表：
 *   np-anotice-stock.eastmoney.com/api/security/ann
 *
 * 量纲陷阱：这几个接口的比例字段是**小数**（0.982358 表示 98.24%），
 * 而同一家公司的 F10 股权接口给的却直接是百分数（23.61 表示 23.61%）。
 * 两种口径混在一个产品里，照搬任意一边都会把数字显示错一百倍——
 * 而 0.98% 和 98.24% 在页面上都长得像个正常数字，肉眼分不出对错。
 * 所以这一层统一换算成百分数，页面只认百分数。
 */

const F10_ORIGIN = "https://emweb.securities.eastmoney.com";
const ANNOUNCE_ORIGIN = "https://np-anotice-stock.eastmoney.com";
const ANNOUNCE_PATH = "/api/security/ann";
/** 公告正文页，实测返回 200。 */
const NOTICE_DETAIL = "https://data.eastmoney.com/notices/detail";

const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BYTES = 4 * 1024 * 1024;
const ANNOUNCE_COUNT = 30;
/** 筛股东大会时要多扫一些公告，否则可能一条都筛不出来。 */
const MEETING_SCAN_COUNT = 100;
/** 公告与交易数据每天都在变，缓存一小时。 */
const TTL_MS = 60 * 60 * 1000;

/*
 * 主营构成的一行。
 *
 * 上游一次给 136 行，跨 16 个报告期、3 种统计口径。全铺在一张表里，
 * 「其他(补充)」会重复出现十几次而彼此无法区分，卡片上那句「截至 2025-12-31」
 * 对其余一百多行都是假的——一条 2017 年的地区收入会被读成 2025 年年报口径。
 * 所以报告期和口径都必须带出来。
 */
export type RevenueScope = "按产品" | "按地区" | "按行业" | "未标注";

export type RevenueSlice = Readonly<{
  cost: number | null;
  /** 百分数。 */
  grossMargin: number | null;
  income: number | null;
  /** 百分数。 */
  incomeRatio: number | null;
  name: string | null;
  reportedOn: string | null;
  scope: RevenueScope;
}>;

export type Dividend = Readonly<{
  exDividendOn: string | null;
  noticedOn: string | null;
  payCashOn: string | null;
  plan: string | null;
  progress: string | null;
  recordOn: string | null;
}>;

export type Placement = Readonly<{
  amount: number | null;
  issuedOn: string | null;
  kind: string | null;
  price: number | null;
  volume: number | null;
}>;

export type CompanyEvent = Readonly<{
  content: string | null;
  happensOn: string | null;
  kind: string | null;
  subKind: string | null;
}>;

export type BlockTrade = Readonly<{
  amount: number | null;
  buyer: string | null;
  closePrice: number | null;
  price: number | null;
  /** 百分数；负数是折价。 */
  premiumRatio: number | null;
  seller: string | null;
  tradedOn: string | null;
  volume: number | null;
}>;

export type TopListEntry = Readonly<{
  /** 百分数。 */
  buyRatio: number | null;
  buyTotal: number | null;
  reason: string | null;
  /** 百分数。 */
  sellRatio: number | null;
  sellTotal: number | null;
  tradedOn: string | null;
}>;

export type MarginEntry = Readonly<{
  financingBalance: number | null;
  financingBuy: number | null;
  financingRepay: number | null;
  securitiesBalance: number | null;
  securitiesSellVolume: number | null;
  tradedOn: string | null;
}>;

/*
 * 哪几段数据这次真的取到了。
 *
 * 三个上游接口是独立的。BonusFinancing 单点超时的时候，早先的实现会把
 * dividends 和 placements 写成空数组落盘，页面随即显示「按最新披露，
 * 当前没有披露的分红送配方案」——贵州茅台会被写成从未分红，还缓存一小时。
 *
 * 「没拿到」和「确实没有」必须分开。
 */
export type OpsAvailability = Readonly<{
  /** BonusFinancing：分红送配、增发一览。 */
  bonus: boolean;
  /** BusinessAnalysis：收入构成。 */
  business: boolean;
  /** OperationsRequired：大事提醒、大宗交易、龙虎榜、融资融券。 */
  operations: boolean;
}>;

export type CompanyOps = Readonly<{
  available: OpsAvailability;
  blockTrades: readonly BlockTrade[];
  dividends: readonly Dividend[];
  events: readonly CompanyEvent[];
  fetchedAt: string;
  margin: readonly MarginEntry[];
  placements: readonly Placement[];
  revenueMix: readonly RevenueSlice[];
  symbol: string;
  topList: readonly TopListEntry[];
}>;

/*
 * 公告的三种取法。
 *   latest    最新公告，不筛
 *   periodic  f_node=1，东财的「财务报告」大类（季报、分配方案、业绩预告都在内）
 *   meetings  股东大会——上游没有专门的数据集，实测 dstx（大事提醒）里只有
 *             龙虎榜/融资融券/报表披露/大宗交易，一条股东大会都没有。
 *             但股东大会决议本身就是公告的一类，按类目筛是真实来源。
 */
export type AnnouncementScope = "latest" | "meetings" | "periodic";

/** 股东大会相关的公告类目与标题关键词。 */
const MEETING_PATTERN = /股东大会|股东会/u;

export type Announcement = Readonly<{
  category: string | null;
  href: string;
  noticedOn: string | null;
  title: string | null;
}>;

export type Announcements = Readonly<{
  fetchedAt: string;
  items: readonly Announcement[];
  scope: AnnouncementScope;
  symbol: string;
}>;

/*
 * 券商研究报告。
 *
 * 来源：东方财富研报接口，免费、无需鉴权，已实测可用：
 *   https://reportapi.eastmoney.com/report/list?code=300862&qType=0&...
 * 正文页 https://data.eastmoney.com/report/info/<infoCode>.html 实测返回 200。
 *
 * 目标价和评级是**某家券商的观点**，不是事实。所以每一条都必须带机构名和
 * 发布日期——不带来源地摆一个「目标价 42.30 元」出来，页面就是在替券商说话。
 */
/* 数据中心接口，关联交易等数据集走这里。 */
const DATACENTER_ORIGIN = "https://datacenter-web.eastmoney.com";
const DATACENTER_PATH = "/api/data/v1/get";

const RESEARCH_ORIGIN = "https://reportapi.eastmoney.com";
const RESEARCH_PATH = "/report/list";
const RESEARCH_DETAIL = "https://data.eastmoney.com/report/info";
const RESEARCH_COUNT = 20;
/** 覆盖范围要够宽，否则小盘股会显示成「没人写过」。 */
const RESEARCH_BEGIN = "2015-01-01";
const RESEARCH_END = "2099-12-31";

export type ResearchReport = Readonly<{
  href: string;
  institution: string | null;
  publishedOn: string | null;
  rating: string | null;
  /** 元/股；这是该券商的目标价，不是市场共识。 */
  targetPrice: number | null;
  thisYearEps: number | null;
  title: string | null;
}>;

export type ResearchReports = Readonly<{
  fetchedAt: string;
  reports: readonly ResearchReport[];
  symbol: string;
}>;

const cacheDirectory = (): string =>
  resolve(
    process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance/instruments"),
    "f10",
  );

const readCache = <T>(name: string): T | null => {
  try {
    return JSON.parse(
      readFileSync(resolve(cacheDirectory(), `${name}.json`), "utf8"),
    ) as T;
  } catch {
    return null;
  }
};

const writeCache = (name: string, value: unknown): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = resolve(cacheDirectory(), `${name}.json`);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果。
  }
};

const isFresh = (iso: string): boolean => {
  const stamp = new Date(iso).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp < TTL_MS;
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

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** 上游按万元报的金额；页面统一用元。 */
const wanYuanToYuan = (value: unknown): number | null => {
  const parsed = numeric(value);
  return parsed === null ? null : parsed * 10_000;
};

/** 上游给的是小数；页面只认百分数。 */
const asPercent = (value: unknown): number | null => {
  const parsed = numeric(value);
  return parsed === null ? null : parsed * 100;
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

/** dstx 是 { data: [[...]] } —— 比别的段多包了一层数组。 */
const eventRows = (value: unknown): readonly Record<string, unknown>[] => {
  if (typeof value !== "object" || value === null) return [];
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((group) => rows(group));
};

/*
 * MAINOP_TYPE 的取值是实测出来的：1 按行业、2 按产品、3 按地区。
 * 认不出来的标「未标注」，不硬塞进某一类。
 */
const REVENUE_SCOPES: Readonly<Record<string, RevenueScope>> = {
  "1": "按行业",
  "2": "按产品",
  "3": "按地区",
};

const revenueScope = (value: unknown): RevenueScope =>
  REVENUE_SCOPES[text(value) ?? ""] ?? "未标注";

const bareCode = (symbol: string): string => symbol.slice(2);
const upstreamCode = (symbol: string): string => symbol.toUpperCase();

const f10Url = (module: string, symbol: string): string =>
  `${F10_ORIGIN}/PC_HSF10/${module}/PageAjax?code=${upstreamCode(symbol)}`;

/**
 * 取一只标的的公司运作与交易数据；三个接口全都拿不到才返回 null。
 *
 * 某一段是空数组表示「确实没有」——比如这家公司没有增发记录，
 * 那是一个确定的答案，不是失败。
 */
export const loadCompanyOps = async (
  rawSymbol: string,
): Promise<CompanyOps | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cacheName = `${symbol}-ops`;
  const cached = readCache<CompanyOps>(cacheName);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const [operations, business, bonus] = await Promise.all([
    fetchJson(f10Url("OperationsRequired", symbol)),
    fetchJson(f10Url("BusinessAnalysis", symbol)),
    fetchJson(f10Url("BonusFinancing", symbol)),
  ]);

  // 三个都没拿到才算失败；拿到任意一个就照它能给的部分渲染。
  if (operations === null && business === null && bonus === null) {
    return cached;
  }

  const ops = (operations ?? {}) as Record<string, unknown>;
  const biz = (business ?? {}) as Record<string, unknown>;
  const bon = (bonus ?? {}) as Record<string, unknown>;

  const result: CompanyOps = {
    available: {
      bonus: bonus !== null,
      business: business !== null,
      operations: operations !== null,
    },
    blockTrades: rows(ops.dzjy).map((row) => ({
      amount: numeric(row.DEAL_AMT),
      buyer: text(row.BUYER_NAME),
      closePrice: numeric(row.CLOSE_PRICE),
      premiumRatio: asPercent(row.PREMIUM_RATIO),
      price: numeric(row.DEAL_PRICE),
      seller: text(row.SELLER_NAME),
      tradedOn: dateOnly(row.TRADE_DATE),
      volume: numeric(row.DEAL_VOLUME),
    })),
    dividends: rows(bon.fhyx).map((row) => ({
      exDividendOn: dateOnly(row.EX_DIVIDEND_DATE),
      noticedOn: dateOnly(row.NOTICE_DATE),
      payCashOn: dateOnly(row.PAY_CASH_DATE),
      plan: text(row.IMPL_PLAN_PROFILE),
      progress: text(row.ASSIGN_PROGRESS),
      recordOn: dateOnly(row.EQUITY_RECORD_DATE),
    })),
    events: eventRows(ops.dstx).map((row) => ({
      content: text(row.LEVEL1_CONTENT),
      happensOn: dateOnly(row.NOTICE_DATE),
      kind: text(row.EVENT_TYPE),
      subKind: text(row.SPECIFIC_EVENTTYPE),
    })),
    fetchedAt: new Date().toISOString(),
    margin: rows(ops.rzrq).map((row) => ({
      financingBalance: numeric(row.FIN_BALANCE),
      financingBuy: numeric(row.FIN_BUY_AMT),
      financingRepay: numeric(row.FIN_REPAY_AMT),
      securitiesBalance: numeric(row.LOAN_BALANCE),
      securitiesSellVolume: numeric(row.LOAN_SELL_VOL),
      tradedOn: dateOnly(row.TRADE_DATE),
    })),
    /*
     * 字段名是拿一只确实增发过的股票（SH600030）打接口看出来的，不是猜的。
     * 第一版猜的 RAISE_NET_AMT / ISSUE_DATE / ISSUE_TYPE 三个全错，而当时的
     * 样例股票 zfmx 是空数组，三列永远显示「—」——看起来像上市公司没披露。
     */
    placements: rows(bon.zfmx).map((row) => ({
      amount: numeric(row.NET_RAISE_FUNDS),
      issuedOn: dateOnly(row.LISTING_DATE) ?? dateOnly(row.NOTICE_DATE),
      kind: text(row.ISSUE_WAY_EXPLAIN),
      price: numeric(row.ISSUE_PRICE),
      volume: numeric(row.ISSUE_NUM),
    })),
    revenueMix: rows(biz.zygcfx).map((row) => ({
      cost: numeric(row.MAIN_BUSINESS_COST),
      grossMargin: asPercent(row.GROSS_RPOFIT_RATIO),
      income: numeric(row.MAIN_BUSINESS_INCOME),
      incomeRatio: asPercent(row.MBI_RATIO),
      name: text(row.ITEM_NAME),
      reportedOn: dateOnly(row.REPORT_DATE),
      scope: revenueScope(row.MAINOP_TYPE),
    })),
    symbol,
    topList: rows(ops.lhbd).map((row) => ({
      buyRatio: asPercent(row.TOTAL_BUYRIOTOP),
      buyTotal: numeric(row.TOTAL_BUY),
      reason: text(row.EXPLANATION),
      sellRatio: asPercent(row.TOTAL_SELLRIOTOP),
      sellTotal: numeric(row.TOTAL_SELL),
      tradedOn: dateOnly(row.TRADE_DATE),
    })),
  };

  /*
   * 三路都成功才落盘。
   *
   * 少了这一步，BonusFinancing 一次单点超时就会把「这家公司没有分红记录」
   * 缓存一小时——贵州茅台会被写成从未分红。缓存放大了错误的影响面，
   * 而错误本身在页面上完全看不出来。
   */
  if (
    result.available.bonus &&
    result.available.business &&
    result.available.operations
  ) {
    writeCache(cacheName, result);
  }
  return result;
};

/*
 * 关联交易。
 *
 * 来源：东方财富数据中心公开接口，免费、无需鉴权，已实测可用：
 *   reportName=RPT_RELATED_TRADE&filter=(SECURITY_CODE="300862")
 *
 * 这与「高管增减持」不是同一份数据——那一份是董监高买卖自家股票，
 * 这一份是公司与关联方之间的交易。两个导航项指向同样的内容会让人以为
 * 我们凑数，所以先确认过它们确实不同才做。
 */
const RELATED_REPORT = "RPT_RELATED_TRADE";
const RELATED_COUNT = 20;

export type RelatedTrade = Readonly<{
  amount: number | null;
  isControlling: string | null;
  noticedOn: string | null;
  party: string | null;
  profile: string | null;
  relation: string | null;
  way: string | null;
}>;

export type RelatedTrades = Readonly<{
  fetchedAt: string;
  symbol: string;
  trades: readonly RelatedTrade[];
}>;

/**
 * 取一只标的的关联交易；拿不到返回 null。
 *
 * 空列表是「未披露关联交易」，是一个确定的答案。
 */
export const loadRelatedTrades = async (
  rawSymbol: string,
): Promise<RelatedTrades | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cacheName = `${symbol}-related`;
  const cached = readCache<RelatedTrades>(cacheName);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const query = new URLSearchParams({
    columns: "ALL",
    filter: `(SECURITY_CODE="${bareCode(symbol)}")`,
    pageSize: String(RELATED_COUNT),
    reportName: RELATED_REPORT,
    sortColumns: "NOTICE_DATE",
    sortTypes: "-1",
  });
  const payload = await fetchJson(
    `${DATACENTER_ORIGIN}${DATACENTER_PATH}?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const result = (payload as Record<string, unknown>).result;
  const data =
    typeof result === "object" && result !== null
      ? (result as Record<string, unknown>).data
      : null;

  const trades: RelatedTrades = {
    fetchedAt: new Date().toISOString(),
    symbol,
    trades: rows(data).map((row) => ({
      /*
       * TRADE_AMT 的单位是**万元**，不是元。
       * 实测：10000 对应公告原文「共计 100,000,000 元」，
       *      50000 对应「人民币 50,000 万元」。
       * 当成元用，一笔 30 亿的授信会显示成 30 万元——少一万倍，
       * 而「30.00 万元」在页面上完全像个正常数字。
       */
      amount: wanYuanToYuan(row.TRADE_AMT),
      isControlling: text(row.IS_CONTROL),
      noticedOn: dateOnly(row.NOTICE_DATE),
      party: text(row.RELATED_PARTY),
      profile: text(row.TRADE_PROFILE),
      relation: text(row.RELATED_RELATION),
      way: text(row.TRADE_WAY),
    })),
  };
  writeCache(cacheName, trades);
  return trades;
};

/** 目标价在上游是字符串形式的元值。 */
const numericText = (value: unknown): number | null => {
  if (typeof value === "number") return numeric(value);
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 取一只标的的券商研报；拿不到返回 null。
 *
 * 空列表是真实答案：小盘股常年没有券商覆盖。说成「取不到」会让人以为
 * 是我们没查到，而不是确实没有人写过。
 */
export const loadResearchReports = async (
  rawSymbol: string,
): Promise<ResearchReports | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cacheName = `${symbol}-research`;
  const cached = readCache<ResearchReports>(cacheName);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const query = new URLSearchParams({
    beginTime: RESEARCH_BEGIN,
    code: bareCode(symbol),
    endTime: RESEARCH_END,
    industryCode: "*",
    pageNo: "1",
    pageSize: String(RESEARCH_COUNT),
    qType: "0",
  });
  const payload = await fetchJson(
    `${RESEARCH_ORIGIN}${RESEARCH_PATH}?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const reports = rows((payload as Record<string, unknown>).data).flatMap(
    (row) => {
      const infoCode = text(row.infoCode);
      // 没有编号就构造不出正文链接，那条研报只会是一行读者无法核对的字。
      if (infoCode === null) return [];
      return [
        {
          href: `${RESEARCH_DETAIL}/${infoCode}.html`,
          institution: text(row.orgSName),
          publishedOn: dateOnly(row.publishDate),
          rating: text(row.emRatingName),
          targetPrice: numericText(row.indvAimPriceT),
          thisYearEps: numericText(row.predictThisYearEps),
          title: text(row.title),
        },
      ];
    },
  );

  const result: ResearchReports = {
    fetchedAt: new Date().toISOString(),
    reports,
    symbol,
  };
  writeCache(cacheName, result);
  return result;
};

/**
 * 取一只标的的公告列表；拿不到返回 null。
 *
 * scope 为 periodic 时加 f_node=1，那是上游用来筛定期报告的参数——
 * 少了它，「年度报告」这一页会把全部公告都列出来。
 */
export const loadAnnouncements = async (
  rawSymbol: string,
  scope: AnnouncementScope,
): Promise<Announcements | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cacheName = `${symbol}-ann-${scope}`;
  const cached = readCache<Announcements>(cacheName);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const code = bareCode(symbol);
  const query = new URLSearchParams({
    ann_type: "A",
    client_source: "web",
    page_index: "1",
    /*
     * 股东大会是从全量公告里筛出来的，所以得多要一些回来，
     * 否则一页 30 条里可能一条股东大会都没有。
     */
    page_size: String(scope === "meetings" ? MEETING_SCAN_COUNT : ANNOUNCE_COUNT),
    stock_list: code,
  });
  if (scope === "periodic") query.set("f_node", "1");

  const payload = await fetchJson(
    `${ANNOUNCE_ORIGIN}${ANNOUNCE_PATH}?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const data = (payload as Record<string, unknown>).data;
  const list =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).list
      : null;

  const items = rows(list).flatMap((row) => {
    const artCode = text(row.art_code);
    // 没有编号就构造不出链接，那条公告只会是一行点不动的字。
    if (artCode === null) return [];
    const columns = rows(row.columns);
    return [
      {
        category: text(columns[0]?.column_name),
        href: `${NOTICE_DETAIL}/${code}/${artCode}.html`,
        noticedOn: dateOnly(row.notice_date),
        title: text(row.title),
      },
    ];
  });

  const result: Announcements = {
    fetchedAt: new Date().toISOString(),
    /*
     * 股东大会按类目与标题筛。上游没有专门的接口，而 dstx 里一条都没有——
     * 早先那一版把大事提醒（龙虎榜、融资融券）当成股东大会渲染，
     * 空态还写「当前没有披露的重要日程」，读起来像这家公司从没开过股东大会。
     */
    items:
      scope === "meetings"
        ? items.filter(
            (item) =>
              MEETING_PATTERN.test(item.title ?? "") ||
              MEETING_PATTERN.test(item.category ?? ""),
          )
        : items,
    scope,
    symbol,
  };
  writeCache(cacheName, result);
  return result;
};
