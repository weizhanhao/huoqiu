import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadFund } from "../../src/server/fund.server";

/*
 * 基金详情。
 *
 * 两个免费公开接口（均已实测可用）：
 *   基金概况 datacenter-web.eastmoney.com/api/data/v1/get
 *            ?reportName=RPT_FUND_RANK&filter=(SECURITY_CODE="110022")
 *   净值历史 api.fund.eastmoney.com/f10/lsjz?fundCode=110022
 *            （这个要带 Referer，否则被拒）
 *
 * 两边的数据交叉对得上：概况里的 PER_NAV 2.95 与净值历史首行的 DWJZ 2.9500
 * 相符，CHANGE -0.1 与 JZZZL -0.10 相符。量纲：净值元、规模元、收益率百分数。
 *
 * 值是照真实结构改写的合成数据。
 */

const PROFILE_ROW = {
  APPLY_RATE: 1.5,
  CHANGE: -0.1,
  CHANGE_3MONTHS: -3.34,
  CHANGE_YEAR: -14.94,
  FUND_NAME: "示例消费行业股票",
  FUND_SCALE: 9_705_960_892.17,
  FUND_TYPE: "股票",
  NAV_DATE: "2026-08-12 00:00:00",
  ORG_NAME: "示例基金",
  PER_NAV: 2.95,
  START_DATE: "2010-07-26 00:00:00",
  STOCKTYPE: "股票型",
};

const NAV_ROWS = [
  {
    DWJZ: "2.9500",
    FSRQ: "2026-08-12",
    JZZZL: "-0.10",
    LJJZ: "2.9500",
    SGZT: "开放申购",
    SHZT: "开放赎回",
  },
  {
    DWJZ: "2.9530",
    FSRQ: "2026-08-11",
    JZZZL: "0.20",
    LJJZ: "2.9530",
    SGZT: "开放申购",
    SHZT: "开放赎回",
  },
];

let directory = "";

const stub = (
  options: Readonly<{ nav?: unknown; profile?: unknown }> = {},
): { seen: () => readonly string[] } => {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("lsjz")) {
      const rows = "nav" in options ? options.nav : NAV_ROWS;
      if (rows === null) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ Data: { LSJZList: rows } }), {
        status: 200,
      });
    }
    const rows = "profile" in options ? options.profile : [PROFILE_ROW];
    if (rows === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify({ result: { data: rows } }), {
      status: 200,
    });
  });
  return { seen: () => seen };
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-fund-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("fund detail from the free endpoints", () => {
  it("maps both sources onto one shape the page can render", async () => {
    stub();

    const fund = await loadFund("110022");

    expect(fund?.name).toBe("示例消费行业股票");
    expect(fund?.manager).toBe("示例基金");
    expect(fund?.netValue).toBe(2.95);
    expect(fund?.netValueOn).toBe("2026-08-12");
    // 成立日期上游带时间段，页面要的是日期。
    expect(fund?.startedOn).toBe("2010-07-26");
    expect(fund?.scale).toBe(9_705_960_892.17);
    expect(fund?.navHistory[0]).toEqual({
      accumulated: 2.95,
      changePercent: -0.1,
      date: "2026-08-12",
      netValue: 2.95,
      purchaseState: "开放申购",
      redeemState: "开放赎回",
    });
  });

  it("asks the nav endpoint at all", async () => {
    const probe = stub();

    await loadFund("110022");

    /*
     * 净值接口校验来源，缺了 Referer 直接被拒。那种情况下概况还是好的、
     * 只有净值那一段空着——看起来像「这只基金没有净值数据」。
     */
    expect(probe.seen().some((url) => url.includes("lsjz"))).toBe(true);
  });

  it("refuses a code shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const code of ["11002", "sz110022", "", "abcdef", "1100222"]) {
      expect(await loadFund(code)).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when the fund does not exist upstream", async () => {
    stub({ profile: [] });

    // 概况查不到就是没有这只基金，不产出一条只有净值的半截记录。
    expect(await loadFund("110022")).toBeNull();
  });

  it("still serves the profile when only the nav history fails", async () => {
    stub({ nav: null });

    const fund = await loadFund("110022");

    /*
     * 净值历史挂了不等于这只基金没了。概况照常给，净值列表为空，
     * 由页面说明这一段取不到——而不是整页变成「基金不存在」。
     */
    expect(fund?.name).toBe("示例消费行业股票");
    expect(fund?.navHistory).toEqual([]);
  });

  it("returns nothing when upstream fails outright", async () => {
    stub({ nav: null, profile: null });

    expect(await loadFund("110022")).toBeNull();
  });
});
