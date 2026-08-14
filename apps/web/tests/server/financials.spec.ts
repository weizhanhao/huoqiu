import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadEarningsForecast,
  loadStatement,
} from "../../src/server/financials.server";

/*
 * 四张财务报表来自东方财富数据中心的公开接口（免费、无需鉴权，已实测可用）：
 *   https://datacenter.eastmoney.com/securities/api/data/v1/get
 *     ?reportName=RPT_F10_FINANCE_MAINFINADATA | GINCOME | GBALANCE | GCASHFLOW
 *
 * 上游一行是一个报告期、两百来个字段。报表要的是「项目 × 报告期」的二维表，
 * 所以这里守的是那次转置不会把数字放错格子——那是这一层唯一会出错的地方，
 * 而放错了在页面上完全看不出来：每个数字都真实存在，只是长在了别的行上。
 *
 * 值是照真实结构改写的合成数据。
 */

const period = (
  reportDate: string,
  name: string,
  overrides: Record<string, unknown>,
) => ({
  CURRENCY: "CNY",
  REPORT_DATE: reportDate,
  REPORT_DATE_NAME: name,
  ...overrides,
});

const INCOME_ROWS = [
  period("2026-03-31 00:00:00", "2026一季报", {
    BASIC_EPS: -0.05,
    OPERATE_COST: 60_000_000,
    PARENT_NETPROFIT: -8_664_273.54,
    TOTAL_OPERATE_INCOME: 88_116_291.23,
  }),
  period("2025-12-31 00:00:00", "2025年报", {
    BASIC_EPS: -0.48,
    OPERATE_COST: 280_000_000,
    PARENT_NETPROFIT: -88_766_486.45,
    TOTAL_OPERATE_INCOME: 398_971_127.32,
  }),
];

let directory = "";

const stubUpstream = (rows: readonly unknown[] | null, status = 200): void => {
  vi.stubGlobal("fetch", async () =>
    status === 200 && rows !== null
      ? new Response(JSON.stringify({ result: { data: rows } }), { status })
      : new Response("", { status: status === 200 ? 500 : status }),
  );
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-fin-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("financial statements from the free data-centre endpoint", () => {
  it("transposes periods into columns without shuffling the numbers", async () => {
    stubUpstream(INCOME_ROWS);

    const statement = await loadStatement("sz300862", "income");

    expect(statement?.periods).toEqual([
      { endedOn: "2026-03-31", label: "2026一季报" },
      { endedOn: "2025-12-31", label: "2025年报" },
    ]);

    const revenue = statement?.sections
      .flatMap((section) => section.lines)
      .find((line) => line.label === "营业总收入");
    /*
     * 顺序必须跟 periods 一一对应。错位一格，页面上每个数字都还是真的，
     * 只是全都长在了错误的报告期底下——而那在界面上完全看不出来。
     */
    expect(revenue?.values).toEqual([88_116_291.23, 398_971_127.32]);

    const profit = statement?.sections
      .flatMap((section) => section.lines)
      .find((line) => line.label === "归母净利润");
    expect(profit?.values).toEqual([-8_664_273.54, -88_766_486.45]);
  });

  it("keeps a missing item as null instead of zero", async () => {
    stubUpstream([
      period("2026-03-31 00:00:00", "2026一季报", {
        TOTAL_OPERATE_INCOME: 88_116_291.23,
        // 本期没有这一项：上游没给，不是给了 0。
      }),
    ]);

    const statement = await loadStatement("sz300862", "income");
    const cost = statement?.sections
      .flatMap((section) => section.lines)
      .find((line) => line.label === "营业成本");

    /*
     * 补 0 会在报表上写出「本期营业成本为零」，那是一句假话。
     * null 才能让页面渲染成「—」，意思是本期未披露。
     */
    expect(cost?.values).toEqual([null]);
  });

  it("carries the unit each line is actually measured in", async () => {
    stubUpstream(INCOME_ROWS);

    const statement = await loadStatement("sz300862", "income");
    const lines = statement?.sections.flatMap((section) => section.lines) ?? [];

    /*
     * 金额是元，每股收益是元/股。整张表套一个单位的话，-0.05 元/股 会被
     * 按金额折算成 -0.000005 万元——单位得跟着行走。
     */
    expect(lines.find((line) => line.label === "营业总收入")?.unit).toBe(
      "yuan",
    );
    expect(lines.find((line) => line.label === "基本每股收益")?.unit).toBe(
      "perShare",
    );
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const symbol of ["300862", "sz30086", "", "us:AAPL"]) {
      expect(await loadStatement(symbol, "income")).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when the company reported no period at all", async () => {
    stubUpstream([]);

    // 一个报告期都没有，说明查不到这只股票的报表，不是「报表全是空的」。
    expect(await loadStatement("sz300862", "income")).toBeNull();
  });

  it("returns nothing when upstream fails and there is no cache", async () => {
    stubUpstream(null);

    expect(await loadStatement("sz300862", "income")).toBeNull();
  });

  it("caches each statement separately so one kind cannot serve another", async () => {
    stubUpstream(INCOME_ROWS);
    await loadStatement("sz300862", "income");

    const cached = JSON.parse(
      readFileSync(resolve(directory, "f10", "sz300862-income.json"), "utf8"),
    ) as { periods: readonly { label: string }[] };
    expect(cached.periods[0]?.label).toBe("2026一季报");

    /*
     * 缓存文件名带上表种。四张表共用一个文件名的话，先打开利润表再打开
     * 资产负债表，第二张会直接拿第一张的缓存渲染——表头是资产负债表，
     * 数字却是利润表的。
     */
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(JSON.stringify({ result: { data: [] } }), {
        status: 200,
      });
    });
    await loadStatement("sz300862", "balance");
    expect(calls).toBe(1);
  });
});

/*
 * 业绩预告来自东方财富数据中心的公开接口（免费、无需鉴权，已实测可用）：
 *   reportName=RPT_PUBLIC_OP_NEWPREDICT&filter=(SECURITY_CODE="300862")
 *
 * 预告给的是一个区间（下限、上限），不是一个点估计。把区间压成一个数字
 * 就是在替上市公司做出它没做的判断。
 */
const FORECAST_ROW = {
  ADD_AMP_LOWER: -1564.85,
  ADD_AMP_UPPER: -1179.36,
  CHANGE_REASON_EXPLAIN: "主营业务利润较上年同期减少，信用减值损失增加。",
  NOTICE_DATE: "2026-01-26 00:00:00",
  PREDICT_AMT_LOWER: -95_000_000,
  PREDICT_AMT_UPPER: -70_000_000,
  PREDICT_CONTENT: "预计亏损 7,000 万元至 9,500 万元。",
  PREDICT_FINANCE: "归属于上市公司股东的净利润",
  PREDICT_TYPE: "首亏",
  REPORT_DATE: "2025-12-31 00:00:00",
};

describe("earnings forecast from the free data-centre endpoint", () => {
  it("keeps the forecast as a range instead of a single number", async () => {
    stubUpstream([FORECAST_ROW]);

    const forecast = await loadEarningsForecast("sz300862");

    expect(forecast?.entries[0]).toEqual({
      amountLower: -95_000_000,
      amountUpper: -70_000_000,
      changeLower: -1564.85,
      changeUpper: -1179.36,
      content: "预计亏损 7,000 万元至 9,500 万元。",
      indicator: "归属于上市公司股东的净利润",
      kind: "首亏",
      noticedOn: "2026-01-26",
      reason: "主营业务利润较上年同期减少，信用减值损失增加。",
      reportedOn: "2025-12-31",
    });
    /*
     * 下限比上限更亏。取任一端当作「预告净利润」都是在替公司下一个
     * 它没下的结论，所以两端都留着。
     */
    expect(forecast?.entries[0]?.amountLower).toBeLessThan(
      forecast?.entries[0]?.amountUpper ?? 0,
    );
  });

  it("treats an empty list as 'no forecast disclosed', not as a failure", async () => {
    stubUpstream([]);

    const forecast = await loadEarningsForecast("sz300862");

    expect(forecast?.entries).toEqual([]);
    expect(forecast).not.toBeNull();
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const symbol of ["300862", "sz30086", "", "us:AAPL"]) {
      expect(await loadEarningsForecast(symbol)).toBeNull();
    }
    expect(calls).toBe(0);
  });
});
