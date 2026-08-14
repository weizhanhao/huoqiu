import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadAnnouncements,
  loadCompanyOps,
  loadRelatedTrades,
  loadResearchReports,
} from "../../src/server/company-ops.server";

/*
 * 公司运作与交易数据来自东方财富的公开接口（免费、无需鉴权，已实测可用）：
 *   PC_HSF10/OperationsRequired/PageAjax  大事提醒 / 大宗交易 / 龙虎榜 / 融资融券
 *   PC_HSF10/BusinessAnalysis/PageAjax    主营构成
 *   PC_HSF10/BonusFinancing/PageAjax      分红送配 / 增发明细
 *   np-anotice-stock.eastmoney.com/...    公告列表
 *
 * 这一份主要守一个陷阱：这几个接口的比例字段是**小数**（0.982358 表示
 * 98.24%），而同一家公司的 F10 股权接口给的却直接是百分数（23.61 表示
 * 23.61%）。两种口径混在一个产品里，照搬任意一边都会把数字显示错一百倍，
 * 而 0.98% 和 98.24% 在页面上都长得像个正常数字。
 *
 * 值是照真实结构改写的合成数据。
 */

const OPS_PAYLOAD = {
  dstx: {
    data: [
      [
        {
          EVENT_TYPE: "报表披露",
          LEVEL1_CONTENT: "于2026-08-29披露2026年中报",
          NOTICE_DATE: "2026-08-29",
          SPECIFIC_EVENTTYPE: "中报预披露",
        },
      ],
    ],
  },
  dzjy: [
    {
      BUYER_NAME: "示例证券某营业部",
      CLOSE_PRICE: 27.26,
      DEAL_AMT: 2_034_400,
      DEAL_PRICE: 24.81,
      DEAL_VOLUME: 82_000,
      // 小数：-0.089875 表示折价 8.99%。
      PREMIUM_RATIO: -0.089_875_275_128,
      SELLER_NAME: "示例证券另一营业部",
      TRADE_DATE: "2025-08-20 00:00:00",
    },
  ],
  lhbd: [
    {
      EXPLANATION: "日涨幅达到15%的前5只证券",
      TOTAL_BUY: 58_901_824,
      // 小数：0.863744 表示 86.37%。
      TOTAL_BUYRIOTOP: 0.863_744_492_993,
      TOTAL_SELL: 13_395_436,
      TOTAL_SELLRIOTOP: 0.196_432_526_032,
      TRADE_DATE: "2026-08-12 00:00:00",
    },
  ],
  rzrq: [
    {
      FIN_BALANCE: 264_379_617,
      FIN_BUY_AMT: 9_806_024,
      FIN_REPAY_AMT: 10_971_621,
      LOAN_BALANCE: 400_648,
      LOAN_SELL_VOL: 0,
      TRADE_DATE: "2026-08-12 00:00:00",
    },
  ],
};

const BUSINESS_PAYLOAD = {
  zygcfx: [
    {
      // 小数：0.246985 表示毛利率 24.70%。
      GROSS_RPOFIT_RATIO: 0.246_985,
      ITEM_NAME: "仪器仪表制造业",
      MAIN_BUSINESS_COST: 295_131_314.28,
      MAIN_BUSINESS_INCOME: 391_932_592.35,
      MAINOP_TYPE: "1",
      // 小数：0.982358 表示占营收 98.24%。
      MBI_RATIO: 0.982_358,
      REPORT_DATE: "2025-12-31 00:00:00",
    },
  ],
};

const BONUS_PAYLOAD = {
  fhyx: [
    {
      ASSIGN_PROGRESS: "实施方案",
      EQUITY_RECORD_DATE: "2026-07-09 00:00:00",
      EX_DIVIDEND_DATE: "2026-07-10 00:00:00",
      IMPL_PLAN_PROFILE: "10派0.05元",
      NOTICE_DATE: "2026-07-02 00:00:00",
    },
  ],
  /*
   * 增发明细的字段名是拿一只确实增发过的股票打接口看出来的，不是猜的。
   * 第一版猜的是 RAISE_NET_AMT / ISSUE_DATE / ISSUE_TYPE，三个全错——
   * 而当时的样例股票 zfmx 是空数组，错得完全看不出来。
   */
  zfmx: [
    {
      ISSUE_NUM: 809_867_629,
      ISSUE_PRICE: 16.62,
      ISSUE_WAY_EXPLAIN: "非公开发行股票",
      LISTING_DATE: "2020-03-11 00:00:00",
      NET_RAISE_FUNDS: 13_460_000_000,
      NOTICE_DATE: "2020-03-13 00:00:00",
    },
  ],
};

let directory = "";

/** 按 URL 分派三份 payload；某一份传 null 表示该请求失败。 */
const stubOps = (
  overrides: Readonly<{
    bonus?: unknown;
    business?: unknown;
    ops?: unknown;
    related?: unknown;
  }> = {},
): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    /*
     * 这里必须区分 undefined 和 null：?? 会把「显式传 null 表示这一路失败」
     * 当成「没传，用默认值」，于是本该失败的请求照样成功——第一版就是这么
     * 写的，那条「全部上游失败」的用例因此在实现正确时也变绿。
     */
    const key = url.includes("BusinessAnalysis")
      ? "business"
      : url.includes("BonusFinancing")
        ? "bonus"
        : url.includes("RPT_RELATED_TRADE")
          ? "related"
          : "ops";
    if (key === "related") {
      const rows = "related" in overrides ? overrides.related : [];
      if (rows === null) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ result: { data: rows } }), {
        status: 200,
      });
    }
    const fallback =
      key === "business"
        ? BUSINESS_PAYLOAD
        : key === "bonus"
          ? BONUS_PAYLOAD
          : OPS_PAYLOAD;
    const pick = key in overrides ? overrides[key] : fallback;
    if (pick === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify(pick), { status: 200 });
  });
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-ops-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("company operations from the free endpoints", () => {
  it("converts the fractional ratios these endpoints use into percentages", async () => {
    stubOps();

    const ops = await loadCompanyOps("sz300862");

    /*
     * 0.982358 是小数，不是 0.98%。原样渲染会把「占营收 98.24%」显示成
     * 「占营收 0.98%」——两者都长得像个正常数字，肉眼分不出对错。
     */
    expect(ops?.revenueMix[0]?.incomeRatio).toBeCloseTo(98.2358, 4);
    expect(ops?.revenueMix[0]?.grossMargin).toBeCloseTo(24.6985, 4);
    expect(ops?.blockTrades[0]?.premiumRatio).toBeCloseTo(-8.9875, 4);
    expect(ops?.topList[0]?.buyRatio).toBeCloseTo(86.3744, 4);
  });

  it("keeps money and share counts in the units the endpoint reports", async () => {
    stubOps();

    const ops = await loadCompanyOps("sz300862");

    // 金额是元，股数是股——这一层不做换算，换算交给渲染层。
    expect(ops?.revenueMix[0]?.income).toBe(391_932_592.35);
    expect(ops?.blockTrades[0]?.volume).toBe(82_000);
    expect(ops?.margin[0]?.financingBalance).toBe(264_379_617);
  });

  it("normalises every date to a plain day", async () => {
    stubOps();

    const ops = await loadCompanyOps("sz300862");

    expect(ops?.dividends[0]?.noticedOn).toBe("2026-07-02");
    expect(ops?.dividends[0]?.exDividendOn).toBe("2026-07-10");
    expect(ops?.blockTrades[0]?.tradedOn).toBe("2025-08-20");
    // dstx 的日期本来就没有时间段，也要能过。
    expect(ops?.events[0]?.happensOn).toBe("2026-08-29");
  });

  it("reads the placement rows with the field names the endpoint actually uses", async () => {
    stubOps();

    const ops = await loadCompanyOps("sz300862");

    /*
     * 猜错字段名的后果不是报错，是「发行日期、发行方式、募资净额」三列
     * 永远显示「—」——看起来像上市公司没披露，实际是我们问错了名字。
     */
    expect(ops?.placements[0]).toEqual({
      amount: 13_460_000_000,
      issuedOn: "2020-03-11",
      kind: "非公开发行股票",
      price: 16.62,
      volume: 809_867_629,
    });
  });

  it("reads the related-trade amount as the 万元 the endpoint reports", async () => {
    stubOps({
      ops: OPS_PAYLOAD,
      related: [
        {
          NOTICE_DATE: "2026-08-08 00:00:00",
          RELATED_PARTY: "示例关联方",
          RELATED_RELATION: "其它关联关系",
          // 上游给的是万元：10000 表示 1 亿元。
          TRADE_AMT: 10_000,
          TRADE_PROFILE: "为示例公司提供担保",
          TRADE_WAY: "担保",
        },
      ],
    });

    const related = await loadRelatedTrades("sz300862");

    /*
     * 实测：TRADE_AMT=10000 对应公告原文「共计 100,000,000 元」，
     * TRADE_AMT=50000 对应「人民币 50,000 万元」。单位是万元。
     * 当成元用，一笔 30 亿的授信会显示成 30 万元——少一万倍。
     */
    expect(related?.trades[0]?.amount).toBe(100_000_000);
  });

  it("tells an empty section apart from a failed fetch", async () => {
    // 这一只确实没有增发记录：上游给的就是空数组。
    stubOps({ bonus: { ...BONUS_PAYLOAD, zfmx: [] } });

    const ops = await loadCompanyOps("sz300862");

    /*
     * 空数组是答案，不是失败。整份取不到才返回 null。
     */
    expect(ops?.placements).toEqual([]);
    expect(ops).not.toBeNull();
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const symbol of ["300862", "sz30086", "", "us:AAPL"]) {
      expect(await loadCompanyOps(symbol)).toBeNull();
      expect(await loadAnnouncements(symbol, "latest")).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when every upstream fails and there is no cache", async () => {
    stubOps({ bonus: null, business: null, ops: null });

    expect(await loadCompanyOps("sz300862")).toBeNull();
  });
});

describe("announcements from the free notice endpoint", () => {
  const ANNOUNCEMENT_PAYLOAD = {
    data: {
      list: [
        {
          art_code: "AN202608111827865989",
          columns: [{ column_name: "股票交易异常波动" }],
          notice_date: "2026-08-11 00:00:00",
          title: "示例公司:股票交易异常波动公告",
        },
      ],
    },
  };

  it("builds a link that actually reaches the notice", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(ANNOUNCEMENT_PAYLOAD), { status: 200 }),
    );

    const result = await loadAnnouncements("sz300862", "latest");

    /*
     * 公告标题不给链接就只是一行字。这个地址形状是实测能打开的
     * （data.eastmoney.com/notices/detail/<code>/<art_code>.html 返回 200）。
     */
    expect(result?.items[0]?.href).toBe(
      "https://data.eastmoney.com/notices/detail/300862/AN202608111827865989.html",
    );
    expect(result?.items[0]?.noticedOn).toBe("2026-08-11");
    expect(result?.items[0]?.category).toBe("股票交易异常波动");
  });

  it("keeps a broker view attributed to the broker who made it", async () => {
    /*
     * 目标价和评级是**某家券商的观点**，不是事实。不带机构名和日期地
     * 摆一个「目标价 42.30 元」出来，页面就是在替券商说话。
     */
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                emRatingName: "买入",
                indvAimPriceT: "42.3",
                infoCode: "AP202104291488572795",
                orgSName: "示例证券",
                predictThisYearEps: 0.88,
                publishDate: "2021-04-29 00:00:00",
                title: "示例点评报告：一季度业绩改善",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await loadResearchReports("sz300862");

    expect(result?.reports[0]).toEqual({
      href: "https://data.eastmoney.com/report/info/AP202104291488572795.html",
      institution: "示例证券",
      publishedOn: "2021-04-29",
      rating: "买入",
      targetPrice: 42.3,
      thisYearEps: 0.88,
      title: "示例点评报告：一季度业绩改善",
    });
  });

  it("treats no coverage as no coverage, not as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const result = await loadResearchReports("sz300862");

    /*
     * 小盘股常年没有券商覆盖。空列表是真实答案——
     * 说成「取不到」会让人以为我们没查到，而不是「确实没有人写」。
     */
    expect(result?.reports).toEqual([]);
    expect(result).not.toBeNull();
  });

  it("asks the endpoint for periodic reports when that is the section", async () => {
    let seen = "";
    vi.stubGlobal("fetch", async (input: string | URL) => {
      seen = String(input);
      return new Response(JSON.stringify(ANNOUNCEMENT_PAYLOAD), {
        status: 200,
      });
    });

    await loadAnnouncements("sz300862", "periodic");

    // f_node=1 是上游用来筛定期报告的参数；少了它「年度报告」页会显示全部公告。
    expect(seen).toContain("f_node=1");
  });
});
