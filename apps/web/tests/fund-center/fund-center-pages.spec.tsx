import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FundDetailPage from "../../src/app/funds/[fundId]/page";
import FundsPage from "../../src/app/funds/page";

/*
 * 基金中心。
 *
 * 这两条路由此前通向的全是假的：列表列六只写死的基金（fund_syn_0001…），
 * 详情页给它们配了编好的净值、持仓和公告；而站内唯一一只真实基金从列表里
 * 根本走不到——它只在直接输入地址时才存在。
 *
 * 现在只有真实基金。这一份守两件事：列表里不许再出现那六只样本；
 * 不存在的基金代码是 404，不是「详情暂未开放」——后者会让人以为这只基金
 * 站里有，只是还没做完，于是隔天再来看一次。
 *
 * 值是照真实结构改写的合成数据，不联网。
 */

const PROFILE = {
  result: {
    data: [
      {
        CHANGE: "0.51",
        CHANGE_3MONTHS: "12.34",
        CHANGE_YEAR: "23.45",
        FUND_NAME: "示例优势混合",
        FUND_SCALE: "12345678",
        NAV_DATE: "2026-08-12",
        ORG_NAME: "示例基金管理有限公司",
        PER_NAV: "1.2345",
        SECURITY_CODE: "110011",
        START_DATE: "2010-01-01",
        STOCKTYPE: "混合型",
      },
    ],
  },
};

const NAV = {
  Data: {
    LSJZList: [
      {
        DWJZ: "1.2345",
        FSRQ: "2026-08-12",
        JZZZL: "0.51",
        LJJZ: "4.5678",
        SGZT: "开放申购",
        SHZT: "开放赎回",
      },
    ],
  },
};

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-fund-page-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

/** 概况查不到就等于没有这只基金，取数层据此返回 null。 */
const stubUpstream = (found: boolean): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("lsjz")) {
      return new Response(JSON.stringify(NAV), { status: 200 });
    }
    return new Response(
      JSON.stringify(found ? PROFILE : { result: { data: [] } }),
      { status: 200 },
    );
  });
};

describe("fund center routes", () => {
  it("no longer offers the six invented funds", async () => {
    const markup = renderToStaticMarkup(
      await FundsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain("基金中心");
    /*
     * 那六只样本基金的名字与标识一个都不能再出现。
     * 它们的收益、规模、持仓全是编的，而页面上看不出这一点。
     */
    expect(markup).not.toContain("火球长跑指数 A");
    expect(markup).not.toContain("fund_syn_000");
    expect(markup).not.toContain("样本数据 · 非实时");
    /*
     * 页面上不能出现申购赎回入口。
     *
     * 原来断言的是那句说明文案，而文案会随产品调整；不能变的是**站内没有
     * 销售牌照，就不该摆一个点了没反应的「购买」**。改成断言按钮不存在。
     */
    expect(markup).not.toContain("立即购买");
    expect(markup).not.toContain("申购");
  });

  it("keeps the deep-linked category from the address bar", async () => {
    const markup = renderToStaticMarkup(
      await FundsPage({
        searchParams: Promise.resolve({ category: "bond" }),
      }),
    );

    // 债券型那一项应当是选中态，而不是回落到默认的混合型。
    expect(markup).toMatch(/aria-pressed="true"[^>]*>债券型/u);
  });

  it("renders a real fund with its own net value and history", async () => {
    stubUpstream(true);

    const markup = renderToStaticMarkup(
      await FundDetailPage({ params: Promise.resolve({ fundId: "110011" }) }),
    );

    expect(markup).toContain("示例优势混合");
    expect(markup).toContain("1.2345");
    expect(markup).toContain("2026-08-12");
  });

  it("404s a fund code that does not exist", async () => {
    stubUpstream(false);

    /*
     * 「详情暂未开放」会让人以为这只基金站里有、只是还没做完。
     * 不存在就该是 404。
     */
    await expect(
      FundDetailPage({ params: Promise.resolve({ fundId: "999999" }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
  });
});
