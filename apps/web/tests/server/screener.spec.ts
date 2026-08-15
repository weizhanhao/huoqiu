import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCREENER_SORTS, loadScreener } from "../../src/server/screener.server";

/*
 * 选股器数据来自东方财富行情列表接口（免费、无需鉴权，已实测可用）：
 *   https://push2.eastmoney.com/api/qt/clist/get?fid=<排序字段>&fs=<市场>&fields=...
 *
 * 这一份守两件事：
 *   1. 上游用字符串 "-" 表示「这只股票没有这个值」（亏损股没有市盈率）。
 *      Number("-") 是 NaN，一路传下去会在页面上渲染成乱码或者被当成 0——
 *      而「市盈率 0」看起来像一只极度便宜的股票，那是彻头彻尾的误导。
 *   2. 排序和分页是**服务端**做的。前端只拿到当前这一页，
 *      在这一页里再排一次序，得到的是「这 20 只里的顺序」而不是全市场顺序。
 *
 * 值是照真实结构改写的合成数据。
 */

const ROW = {
  f115: -24.98,
  f12: "300603",
  f14: "示例科技",
  f2: 9.64,
  f20: 4_480_654_947,
  f21: 3_604_696_807,
  f23: 3.55,
  f3: 20.05,
  f5: 561_192,
  f6: 531_443_180.72,
  f8: 15.01,
  f9: -36.47,
};

let directory = "";
let requested = "";

const stubUpstream = (diff: readonly unknown[] | null, total = 5549): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (diff === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify({ data: { diff, total } }), {
      status: 200,
    });
  });
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-screener-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
  requested = "";
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("screener over the free quote-list endpoint", () => {
  it("maps the numbered fields onto names a page can render", async () => {
    stubUpstream([ROW]);

    const result = await loadScreener({ page: 1 });

    expect(result?.rows[0]).toEqual({
      amount: 531_443_180.72,
      changePercent: 20.05,
      floatMarketCap: 3_604_696_807,
      last: 9.64,
      marketCap: 4_480_654_947,
      name: "示例科技",
      pb: 3.55,
      peDynamic: -36.47,
      peTtm: -24.98,
      symbol: "sz300603",
      turnoverPercent: 15.01,
      volume: 561_192,
    });
    expect(result?.total).toBe(5549);
  });

  it("turns the endpoint's dash into a real absence, not into zero", async () => {
    // 亏损股没有市盈率，上游给的是字符串 "-"。
    stubUpstream([{ ...ROW, f115: "-", f23: "-", f9: "-" }]);

    const result = await loadScreener({ page: 1 });

    /*
     * 0 会让这只股票在「市盈率最低」的排序里冲到最前面，看起来像捡到了
     * 一只极度便宜的股票；NaN 会直接把页面上那一格变成乱码。
     * 只有 null 能让页面老实写「—」。
     */
    expect(result?.rows[0]?.peTtm).toBeNull();
    expect(result?.rows[0]?.pb).toBeNull();
    expect(result?.rows[0]?.peDynamic).toBeNull();
    // 其他字段不受牵连。
    expect(result?.rows[0]?.last).toBe(9.64);
  });

  it("prefixes the market onto the bare code so the row can link out", async () => {
    stubUpstream([
      { ...ROW, f12: "600519", f14: "沪市样例" },
      { ...ROW, f12: "000858", f14: "深市样例" },
      { ...ROW, f12: "688265", f14: "科创样例" },
    ]);

    const result = await loadScreener({ page: 1 });

    /*
     * 上游只给六位代码。站内标的页认的是带市场前缀的形式，
     * 少了这一步每一行都点不进去。
     */
    expect(result?.rows.map((row) => row.symbol)).toEqual([
      "sh600519",
      "sz000858",
      "sh688265",
    ]);
  });

  it("asks the endpoint to do the sorting", async () => {
    stubUpstream([ROW]);

    await loadScreener({ page: 1, sort: "turnover" });

    /*
     * 排序必须是服务端做的。只对当前这一页重排，得到的是「这 20 只里的
     * 顺序」，却会被读成「全市场换手率最高的 20 只」——那是一句假话。
     */
    expect(requested).toContain(`fid=${SCREENER_SORTS.turnover.field}`);
    expect(requested).toContain("po=1");
  });

  it("asks for the page the caller wants", async () => {
    stubUpstream([ROW]);

    await loadScreener({ page: 3 });

    expect(requested).toContain("pn=3");
  });

  it("falls back to the delayed source instead of serving a stale archive", async () => {
    /*
     * 有些网络环境到 push2 不通（本机实测连接直接失败），而 push2delay 通。
     * 早先主源一失败就静默回退到旧缓存，于是页面能连着几小时显示几小时前的
     * 存档，看起来却像此刻的行情——数字是真的，时点是假的。
     *
     * 一份晚十几分钟的真行情，比一份几小时前的存档有用得多；
     * 而且要如实标出它是延时的。
     */
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      // 主源不通，延时源可用。
      if (url.includes("push2delay")) {
        return new Response(
          JSON.stringify({ data: { diff: [ROW], total: 5549 } }),
          { status: 200 },
        );
      }
      return new Response("", { status: 500 });
    });

    const result = await loadScreener({ page: 1 });

    expect(seen.some((url) => url.includes("push2delay"))).toBe(true);
    expect(result?.rows[0]?.symbol).toBe("sz300603");
    // 页面据此标注「延时行情源」，不让人以为是实时。
    expect(result?.delayed).toBe(true);
  });

  it("refuses a page number that is not a real page", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const page of [0, -1, 1.5, Number.NaN, 10_000]) {
      expect(await loadScreener({ page })).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when upstream fails and there is no cache", async () => {
    stubUpstream(null);

    expect(await loadScreener({ page: 1 })).toBeNull();
  });

  it("caches each query separately so one sort cannot serve another", async () => {
    stubUpstream([ROW]);
    await loadScreener({ page: 1, sort: "change" });

    let calls = 0;
    vi.stubGlobal("fetch", async (input: string | URL) => {
      calls += 1;
      requested = String(input);
      return new Response(JSON.stringify({ data: { diff: [ROW], total: 1 } }), {
        status: 200,
      });
    });

    // 同一个查询走缓存。
    await loadScreener({ page: 1, sort: "change" });
    expect(calls).toBe(0);

    /*
     * 换一个排序就得重新取。所有查询共用一个缓存文件的话，
     * 按换手率排的页面会直接拿按涨幅排的结果渲染——表头写着换手率，
     * 顺序却是涨幅的。
     */
    await loadScreener({ page: 1, sort: "turnover" });
    expect(calls).toBe(1);
  });
});
