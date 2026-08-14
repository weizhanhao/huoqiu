import { afterEach, describe, expect, it, vi } from "vitest";

import {
  searchInstruments,
  symbolOfQuoteId,
} from "../../src/server/search.server";

/*
 * 标的搜索。
 *
 * 站内搜索此前是在 35 个虚构标的里做本地过滤：搜「茅台」一条也搜不到，
 * 搜「星海智造」倒是有——一个只能搜到不存在的东西的搜索框。
 *
 * 这一份守三件事：
 *   1. 市场前缀由 QuoteID 的点号前那一位决定，补错会指向另一只股票；
 *   2. 「搜不到」和「取不到」要分开——上游无匹配时给的是 Data: null，
 *      那是前者；整个请求失败才是后者；
 *   3. 站内渲染不出来的标的不给链接。
 *
 * 值是照真实结构改写的合成数据。
 */

const bodyOf = (data: unknown): string =>
  JSON.stringify({
    QuotationCodeTable: { Data: data, Status: 0, TotalCount: 1 },
  });

const ROW = {
  Classify: "AStock",
  Code: "600519",
  Name: "示例股份",
  PinYin: "SLGF",
  QuoteID: "1.600519",
  SecurityTypeName: "沪A",
  UnifiedCode: "600519",
};

let requested = "";

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
});

describe("the market prefix comes from the quote id", () => {
  it("reads 1 as Shanghai and 0 as Shenzhen", () => {
    /*
     * 补错前缀会把人送到另一只完全不同的股票上，而搜索结果那一行
     * 看起来完全正常。
     */
    expect(symbolOfQuoteId("1.600519")).toBe("sh600519");
    expect(symbolOfQuoteId("0.000858")).toBe("sz000858");
    expect(symbolOfQuoteId("1.510300")).toBe("sh510300");
  });

  it("refuses the codes this site has no page for", () => {
    /*
     * 市场码 0 不只是深市——北交所（92xxxx）和新三板（83xxxx / 87xxxx）
     * 也是 0。一律贴 sz 的话，搜「新赣江」会得到 sz920367，而
     * /instruments/sz920367 是 404。这个接口不鉴权、对外公开，
     * 回一个不存在的代码等于把坑留给下一个信它的调用方。
     */
    expect(symbolOfQuoteId("0.920367")).toBeNull();
    expect(symbolOfQuoteId("0.835688")).toBeNull();
    expect(symbolOfQuoteId("0.873347")).toBeNull();
    // 深市真代码照旧。
    expect(symbolOfQuoteId("0.000858")).toBe("sz000858");
    expect(symbolOfQuoteId("0.300750")).toBe("sz300750");
  });

  it("maps Hong Kong and US listings too", () => {
    /*
     * 这两类原先一律给 null，理由是「站内没有它们的页面」——搜「腾讯」
     * 第一条就是腾讯控股 00700，却是一行点不动的文字。现在个股页支持这
     * 两个市场了，链接就该给。
     *
     * 市场码：116 港股，105 纳斯达克、106 纽交所、107 美交所。
     * 三个美股市场码都归到 us 前缀——站内地址不区分交易所，交易所是打开
     * 页面时现问的。
     */
    expect(symbolOfQuoteId("116.00700")).toBe("hk00700");
    expect(symbolOfQuoteId("105.AAPL")).toBe("usaapl");
    expect(symbolOfQuoteId("106.BRK_B")).toBe("usbrk_b");
    expect(symbolOfQuoteId("107.IMO")).toBe("usimo");
  });

  it("refuses anything it cannot read", () => {
    for (const value of [
      // 港股代码是数字，不是字母。
      "116.ABCDE",
      // 板块（BK1189）、期货（AP610）都不是能打开的标的页。
      "90.BK1189",
      "220.AP610",
      "600519",
      "",
      null,
      undefined,
      2,
    ]) {
      expect(symbolOfQuoteId(value), String(value)).toBeNull();
    }
  });
});

describe("searching for an instrument", () => {
  it("maps a hit onto something the page can render and link", async () => {
    stubUpstream(bodyOf([ROW]));

    const hits = await searchInstruments("茅台");

    expect(hits).toEqual([
      {
        code: "600519",
        href: "/instruments/sh600519",
        kind: "沪A",
        name: "示例股份",
        symbol: "sh600519",
      },
    ]);
    expect(requested).toContain("input=%E8%8C%85%E5%8F%B0");
  });

  it("gives no link to something this site cannot render", async () => {
    /*
     * 板块没有站内详情页——期货、期权、北交所、新三板也一样。照样给链接
     * 的话，每一条搜索结果都点得进去、每一次都是空页——先许诺再落空，
     * 比不给链接更糟。
     *
     * 这条用例原先用的是港股 116.00700。港股现在有页面了，拿它当「打不开
     * 的东西」就不再成立；换成板块，这条断言守的还是同一件事。
     */
    stubUpstream(
      bodyOf([
        {
          ...ROW,
          Code: "BK1189",
          QuoteID: "90.BK1189",
          SecurityTypeName: "板块",
        },
      ]),
    );

    const hits = await searchInstruments("腾讯云");

    expect(hits?.[0]?.href).toBeNull();
    expect(hits?.[0]?.symbol).toBeNull();
    // 仍然列出来：搜得到是真的，只是站内没有它的页面。
    expect(hits?.[0]?.name).toBe("示例股份");
  });

  it("tells 'no match' apart from 'search is down'", async () => {
    // 上游无匹配时给的是 Data: null——那是搜不到。
    stubUpstream(bodyOf(null));
    expect(await searchInstruments("不存在的东西")).toEqual([]);

    // 整个请求失败才是取不到。空数组会被读成「没有这只股票」。
    stubUpstream(null);
    expect(await searchInstruments("茅台")).toBeNull();
  });

  it("does not call upstream for an empty query", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(bodyOf([ROW]), { status: 200 });
    });

    // 空查询上游会回一整页热门，那不是用户要的。
    expect(await searchInstruments("   ")).toEqual([]);
    expect(calls).toBe(0);
  });
});
