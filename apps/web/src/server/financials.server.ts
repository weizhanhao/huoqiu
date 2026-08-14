import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 四张财务报表：主要指标、利润表、资产负债表、现金流量表。
 *
 * 来源：东方财富数据中心的公开接口，免费、无需鉴权、返回 UTF-8 JSON，已实测：
 *   https://datacenter.eastmoney.com/securities/api/data/v1/get
 *     ?reportName=RPT_F10_FINANCE_MAINFINADATA | GINCOME | GBALANCE | GCASHFLOW
 *
 * 上游一行是一个报告期、两百来个字段；报表要的是「项目 × 报告期」的二维表。
 * 这一层做的就是那次转置，也是唯一会出错的地方——数字放错格子的时候，
 * 页面上每个数字都还是真的，只是长在了别的报告期底下，肉眼完全看不出来。
 *
 * 单位跟着行走，不是整张表一个单位：金额是元，每股收益是元/股，
 * 毛利率是百分数，周转是天。整张表套一个单位会把 -0.05 元/股 折算成
 * -0.000005 万元。
 */

const ORIGIN = "https://datacenter.eastmoney.com";
const PATH = "/securities/api/data/v1/get";

const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BYTES = 4 * 1024 * 1024;
/** 取最近八个报告期：两年的季报，够看出趋势又不至于把表撑得读不动。 */
const PERIOD_COUNT = 8;
/** 报表按季度披露，缓存半天。 */
const TTL_MS = 12 * 60 * 60 * 1000;

export type StatementKind = "balance" | "cashflow" | "income" | "metrics";

/** 每一行自己的量纲。 */
export type LineUnit = "days" | "percent" | "perShare" | "times" | "yuan";

export type StatementLine = Readonly<{
  label: string;
  unit: LineUnit;
  /** 与 periods 一一对应；本期未披露为 null，不补 0。 */
  values: readonly (number | null)[];
}>;

export type StatementSection = Readonly<{
  lines: readonly StatementLine[];
  title: string;
}>;

export type StatementPeriod = Readonly<{
  endedOn: string | null;
  label: string | null;
}>;

export type FinancialStatement = Readonly<{
  currency: string | null;
  fetchedAt: string;
  kind: StatementKind;
  periods: readonly StatementPeriod[];
  sections: readonly StatementSection[];
  symbol: string;
}>;

type LineSpec = Readonly<{ field: string; label: string; unit: LineUnit }>;
type SectionSpec = Readonly<{ lines: readonly LineSpec[]; title: string }>;

const yuan = (field: string, label: string): LineSpec => ({
  field,
  label,
  unit: "yuan",
});
const percent = (field: string, label: string): LineSpec => ({
  field,
  label,
  unit: "percent",
});

/*
 * 每张表挑出来的科目。
 *
 * 上游给两百来个字段，全铺出来没人读得完。这里挑的是主表科目与常看的口径；
 * 挑剩的不是被藏起来了，而是本页不呈现——页脚的来源说明指明了数据出处。
 */
const SPECS: Readonly<Record<StatementKind, readonly SectionSpec[]>> = {
  balance: [
    {
      lines: [
        yuan("MONETARYFUNDS", "货币资金"),
        yuan("NOTE_ACCOUNTS_RECE", "应收票据及应收账款"),
        yuan("INVENTORY", "存货"),
        yuan("CONTRACT_ASSET", "合同资产"),
        yuan("TOTAL_CURRENT_ASSETS", "流动资产合计"),
      ],
      title: "流动资产",
    },
    {
      lines: [
        yuan("FIXED_ASSET", "固定资产"),
        yuan("CIP", "在建工程"),
        yuan("INTANGIBLE_ASSET", "无形资产"),
        yuan("GOODWILL", "商誉"),
        yuan("TOTAL_NONCURRENT_ASSETS", "非流动资产合计"),
        yuan("TOTAL_ASSETS", "资产总计"),
      ],
      title: "非流动资产",
    },
    {
      lines: [
        yuan("SHORT_LOAN", "短期借款"),
        yuan("NOTE_ACCOUNTS_PAYABLE", "应付票据及应付账款"),
        yuan("CONTRACT_LIAB", "合同负债"),
        yuan("TOTAL_CURRENT_LIAB", "流动负债合计"),
        yuan("LONG_LOAN", "长期借款"),
        yuan("TOTAL_NONCURRENT_LIAB", "非流动负债合计"),
        yuan("TOTAL_LIABILITIES", "负债合计"),
      ],
      title: "负债",
    },
    {
      lines: [
        yuan("SHARE_CAPITAL", "实收资本（股本）"),
        yuan("CAPITAL_RESERVE", "资本公积"),
        yuan("SURPLUS_RESERVE", "盈余公积"),
        yuan("UNASSIGN_RPOFIT", "未分配利润"),
        yuan("TOTAL_PARENT_EQUITY", "归属于母公司股东权益合计"),
        yuan("MINORITY_EQUITY", "少数股东权益"),
        yuan("TOTAL_EQUITY", "所有者权益合计"),
      ],
      title: "所有者权益",
    },
  ],
  cashflow: [
    {
      lines: [
        yuan("SALES_SERVICES", "销售商品、提供劳务收到的现金"),
        yuan("TOTAL_OPERATE_INFLOW", "经营活动现金流入小计"),
        yuan("PAY_STAFF_CASH", "支付给职工以及为职工支付的现金"),
        yuan("PAY_ALL_TAX", "支付的各项税费"),
        yuan("TOTAL_OPERATE_OUTFLOW", "经营活动现金流出小计"),
        yuan("NETCASH_OPERATE", "经营活动产生的现金流量净额"),
      ],
      title: "经营活动",
    },
    {
      lines: [
        yuan("TOTAL_INVEST_INFLOW", "投资活动现金流入小计"),
        yuan("CONSTRUCT_LONG_ASSET", "购建固定资产等支付的现金"),
        yuan("TOTAL_INVEST_OUTFLOW", "投资活动现金流出小计"),
        yuan("NETCASH_INVEST", "投资活动产生的现金流量净额"),
      ],
      title: "投资活动",
    },
    {
      lines: [
        yuan("TOTAL_FINANCE_INFLOW", "筹资活动现金流入小计"),
        yuan("PAY_DEBT_CASH", "偿还债务支付的现金"),
        yuan("TOTAL_FINANCE_OUTFLOW", "筹资活动现金流出小计"),
        yuan("NETCASH_FINANCE", "筹资活动产生的现金流量净额"),
      ],
      title: "筹资活动",
    },
    {
      lines: [
        yuan("CCE_ADD", "现金及现金等价物净增加额"),
        yuan("BEGIN_CCE", "期初现金及现金等价物余额"),
        yuan("END_CCE", "期末现金及现金等价物余额"),
      ],
      title: "现金净变动",
    },
  ],
  income: [
    {
      lines: [
        yuan("TOTAL_OPERATE_INCOME", "营业总收入"),
        yuan("OPERATE_INCOME", "营业收入"),
        yuan("TOTAL_OPERATE_COST", "营业总成本"),
        yuan("OPERATE_COST", "营业成本"),
      ],
      title: "营业收支",
    },
    {
      lines: [
        yuan("SALE_EXPENSE", "销售费用"),
        yuan("MANAGE_EXPENSE", "管理费用"),
        yuan("RESEARCH_EXPENSE", "研发费用"),
        yuan("FINANCE_EXPENSE", "财务费用"),
        yuan("OPERATE_TAX_ADD", "税金及附加"),
      ],
      title: "期间费用",
    },
    {
      lines: [
        yuan("OPERATE_PROFIT", "营业利润"),
        yuan("TOTAL_PROFIT", "利润总额"),
        yuan("INCOME_TAX", "所得税费用"),
        yuan("NETPROFIT", "净利润"),
        yuan("PARENT_NETPROFIT", "归母净利润"),
        yuan("DEDUCT_PARENT_NETPROFIT", "扣非归母净利润"),
        yuan("MINORITY_INTEREST", "少数股东损益"),
      ],
      title: "利润",
    },
    {
      lines: [
        { field: "BASIC_EPS", label: "基本每股收益", unit: "perShare" },
        { field: "DILUTED_EPS", label: "稀释每股收益", unit: "perShare" },
      ],
      title: "每股收益",
    },
  ],
  metrics: [
    {
      lines: [
        { field: "EPSJB", label: "基本每股收益", unit: "perShare" },
        { field: "EPSKCJB", label: "扣非每股收益", unit: "perShare" },
        { field: "BPS", label: "每股净资产", unit: "perShare" },
        { field: "MGJYXJJE", label: "每股经营现金流", unit: "perShare" },
        { field: "MGWFPLR", label: "每股未分配利润", unit: "perShare" },
      ],
      title: "每股指标",
    },
    {
      lines: [
        yuan("TOTALOPERATEREVE", "营业总收入"),
        percent("TOTALOPERATEREVETZ", "营业总收入同比"),
        yuan("PARENTNETPROFIT", "归母净利润"),
        percent("PARENTNETPROFITTZ", "归母净利润同比"),
        yuan("KCFJCXSYJLR", "扣非净利润"),
        percent("KCFJCXSYJLRTZ", "扣非净利润同比"),
      ],
      title: "成长能力",
    },
    {
      lines: [
        percent("ROEJQ", "净资产收益率（加权）"),
        percent("ROEKCJQ", "净资产收益率（扣非/加权）"),
        percent("ZZCJLL", "总资产报酬率"),
        percent("XSMLL", "销售毛利率"),
        percent("XSJLL", "销售净利率"),
      ],
      title: "盈利能力",
    },
    {
      lines: [
        percent("ZCFZL", "资产负债率"),
        { field: "LD", label: "流动比率", unit: "times" },
        { field: "SD", label: "速动比率", unit: "times" },
        { field: "CASH_RATIO", label: "现金比率", unit: "times" },
      ],
      title: "偿债能力",
    },
    {
      lines: [
        { field: "ZZCZZTS", label: "总资产周转天数", unit: "days" },
        { field: "CHZZTS", label: "存货周转天数", unit: "days" },
        { field: "YSZKZZTS", label: "应收账款周转天数", unit: "days" },
        { field: "TOAZZL", label: "总资产周转率", unit: "times" },
      ],
      title: "运营能力",
    },
  ],
};

const REPORT_NAMES: Readonly<Record<StatementKind, string>> = {
  balance: "RPT_F10_FINANCE_GBALANCE",
  cashflow: "RPT_F10_FINANCE_GCASHFLOW",
  income: "RPT_F10_FINANCE_GINCOME",
  metrics: "RPT_F10_FINANCE_MAINFINADATA",
};

export const STATEMENT_TITLES: Readonly<Record<StatementKind, string>> = {
  balance: "资产负债表",
  cashflow: "现金流量表",
  income: "利润表",
  metrics: "主要指标",
};

const cacheDirectory = (): string =>
  resolve(
    process.env.HUOQIU_MARKET_CACHE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance/instruments"),
    "f10",
  );

/*
 * 缓存文件名带上表种。
 *
 * 四张表共用一个文件名的话，先打开利润表再打开资产负债表，第二张会直接拿
 * 第一张的缓存渲染——表头是资产负债表，数字却是利润表的。
 */
const cachePath = (symbol: string, kind: StatementKind): string =>
  resolve(cacheDirectory(), `${symbol}-${kind}.json`);

const readCache = (
  symbol: string,
  kind: StatementKind,
): FinancialStatement | null => {
  try {
    return JSON.parse(
      readFileSync(cachePath(symbol, kind), "utf8"),
    ) as FinancialStatement;
  } catch {
    return null;
  }
};

const writeCache = (statement: FinancialStatement): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = cachePath(statement.symbol, statement.kind);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(statement, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果，下次重新取即可。
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

/** 上游没给就是 null。补 0 会在报表上写出「本期为零」，那是一句假话。 */
const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const dateOnly = (value: unknown): string | null => {
  const raw = text(value);
  if (raw === null) return null;
  const day = raw.slice(0, 10);
  return DATE_PATTERN.test(day) ? day : null;
};

/** SECUCODE 是「六位代码.市场」的大写形式：sz300862 → 300862.SZ。 */
const secuCode = (symbol: string): string =>
  `${symbol.slice(2)}.${symbol.slice(0, 2).toUpperCase()}`;

/*
 * 业绩预告。
 *
 * 来源：东方财富数据中心的公开接口，免费、无需鉴权，已实测可用：
 *   reportName=RPT_PUBLIC_OP_NEWPREDICT&filter=(SECURITY_CODE="300862")
 *
 * 预告给的是一个区间（下限、上限），不是一个点估计。压成一个数字
 * 就是在替上市公司做出它没做的判断，所以两端都保留。
 */
const FORECAST_ORIGIN = "https://datacenter-web.eastmoney.com";
const FORECAST_PATH = "/api/data/v1/get";
const FORECAST_REPORT = "RPT_PUBLIC_OP_NEWPREDICT";
const FORECAST_COUNT = 10;

export type ForecastEntry = Readonly<{
  amountLower: number | null;
  amountUpper: number | null;
  changeLower: number | null;
  changeUpper: number | null;
  content: string | null;
  indicator: string | null;
  kind: string | null;
  noticedOn: string | null;
  reason: string | null;
  reportedOn: string | null;
}>;

export type EarningsForecast = Readonly<{
  entries: readonly ForecastEntry[];
  fetchedAt: string;
  symbol: string;
}>;

/**
 * 取一只标的的业绩预告；拿不到返回 null。
 *
 * 空列表是「未披露业绩预告」，是一个确定的答案，不是失败。
 */
export const loadEarningsForecast = async (
  rawSymbol: string,
): Promise<EarningsForecast | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readForecastCache(symbol);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const query = new URLSearchParams({
    columns: "ALL",
    filter: `(SECURITY_CODE="${symbol.slice(2)}")`,
    pageSize: String(FORECAST_COUNT),
    reportName: FORECAST_REPORT,
    sortColumns: "NOTICE_DATE",
    sortTypes: "-1",
  });
  const payload = await fetchJson(
    `${FORECAST_ORIGIN}${FORECAST_PATH}?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) return cached;

  const result = (payload as Record<string, unknown>).result;
  const data =
    typeof result === "object" && result !== null
      ? (result as Record<string, unknown>).data
      : null;
  const entryRows = Array.isArray(data)
    ? data.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];

  const forecast: EarningsForecast = {
    entries: entryRows.map((row) => ({
      amountLower: numeric(row.PREDICT_AMT_LOWER),
      amountUpper: numeric(row.PREDICT_AMT_UPPER),
      changeLower: numeric(row.ADD_AMP_LOWER),
      changeUpper: numeric(row.ADD_AMP_UPPER),
      content: text(row.PREDICT_CONTENT),
      indicator: text(row.PREDICT_FINANCE),
      kind: text(row.PREDICT_TYPE),
      noticedOn: dateOnly(row.NOTICE_DATE),
      reason: text(row.CHANGE_REASON_EXPLAIN),
      reportedOn: dateOnly(row.REPORT_DATE),
    })),
    fetchedAt: new Date().toISOString(),
    symbol,
  };
  writeForecastCache(forecast);
  return forecast;
};

const forecastPath = (symbol: string): string =>
  resolve(cacheDirectory(), `${symbol}-forecast.json`);

const readForecastCache = (symbol: string): EarningsForecast | null => {
  try {
    return JSON.parse(
      readFileSync(forecastPath(symbol), "utf8"),
    ) as EarningsForecast;
  } catch {
    return null;
  }
};

const writeForecastCache = (forecast: EarningsForecast): void => {
  try {
    mkdirSync(cacheDirectory(), { recursive: true });
    const target = forecastPath(forecast.symbol);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(forecast, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } catch {
    // 缓存写不进去不影响本次结果。
  }
};

/**
 * 取一只标的的某张财务报表；拿不到返回 null。
 *
 * 一个报告期都没有也返回 null——那说明查不到这只股票的报表，
 * 不是「报表全是空的」。
 */
export const loadStatement = async (
  rawSymbol: string,
  kind: StatementKind,
): Promise<FinancialStatement | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;

  const cached = readCache(symbol, kind);
  if (cached !== null && isFresh(cached.fetchedAt)) return cached;

  const query = new URLSearchParams({
    client: "PC",
    columns: "ALL",
    filter: `(SECUCODE="${secuCode(symbol)}")`,
    pageSize: String(PERIOD_COUNT),
    reportName: REPORT_NAMES[kind],
    sortColumns: "REPORT_DATE",
    sortTypes: "-1",
    source: "HSF10",
  });
  const payload = await fetchJson(`${ORIGIN}${PATH}?${query.toString()}`);
  if (typeof payload !== "object" || payload === null) return cached;

  const result = (payload as Record<string, unknown>).result;
  const data =
    typeof result === "object" && result !== null
      ? (result as Record<string, unknown>).data
      : null;
  const periodRows = Array.isArray(data)
    ? data.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];
  if (periodRows.length === 0) return cached;

  const statement: FinancialStatement = {
    currency: text(periodRows[0]?.CURRENCY),
    fetchedAt: new Date().toISOString(),
    kind,
    periods: periodRows.map((row) => ({
      endedOn: dateOnly(row.REPORT_DATE),
      label: text(row.REPORT_DATE_NAME),
    })),
    /*
     * 转置：每一行按 periodRows 的同一顺序取值，所以第 n 个数字对应
     * 第 n 个报告期。顺序一旦不一致，页面上每个数字都还是真的，
     * 只是全都长在了错误的列底下。
     */
    sections: SPECS[kind].map((section) => ({
      lines: section.lines.map((line) => ({
        label: line.label,
        unit: line.unit,
        values: periodRows.map((row) => numeric(row[line.field])),
      })),
      title: section.title,
    })),
    symbol,
  };
  writeCache(statement);
  return statement;
};
