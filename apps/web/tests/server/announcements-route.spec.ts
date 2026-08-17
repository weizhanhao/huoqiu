import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../src/app/api/market/announcements/route";

/*
 * 公告接口。
 *
 * 这条路由原来只有一种行为：回全市场最新公告，`symbol` 参数收下了却从不看。
 * 手机端个股页照着 `?symbol=sh600519` 调它，拿回来的是爱丽家居、*ST网达——
 * 然后原样印在贵州茅台的「公告」页签里。
 *
 * 这类错最难发现：每一行单看都是真公告，日期是真的、链接点得开、PDF 是原件，
 * 只有「这是这只票的公告」这一层是假的。而页面上没有任何地方会露馅。
 *
 * 所以这里守两件事：带 symbol 时必须按标的查，不带时才是全市场流。
 */

const okJson = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

/** 东财按标的查公告的回包形状。 */
const perStock = (): Response =>
  okJson({
    data: {
      list: [
        {
          art_code: "AN202608180001",
          columns: [{ column_name: "定期报告" }],
          notice_date: "2026-08-18 00:00:00",
          title: "贵州茅台2026年半年度报告",
        },
      ],
    },
  });

/** 巨潮全市场流的回包形状。 */
const marketWide = (): Response =>
  okJson({
    announcements: [
      {
        adjunctUrl: "finalpage/2026-08-18/1225478854.PDF",
        announcementTime: 1_787_000_000_000,
        announcementTitle: "爱丽家居关于股票交易停牌核查结果的公告",
        secCode: "603221",
        secName: "爱丽家居",
      },
    ],
    totalAnnouncement: 1,
  });

/*
 * 每条用例一个独立的缓存目录。
 *
 * 按标的查公告是带磁盘缓存的（同一只票十分钟内不重复问上游）。共用一个目录
 * 的话，第二条用例会读到第一条留下的那一行，于是「这只票今天没有公告」这条
 * 断言拿到的是上一条的结果——而它会绿，因为拿到的确实是一行公告。
 */
let cacheDirectory = "";

beforeEach(() => {
  cacheDirectory = mkdtempSync(resolve(tmpdir(), "huoqiu-announce-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", cacheDirectory);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(cacheDirectory, { force: true, recursive: true });
});

const call = (query: string): Promise<Response> =>
  GET(new Request(`https://huoqiu.test/api/market/announcements${query}`));

describe("announcements route", () => {
  it("asks upstream for that one symbol when a symbol is given", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve(perStock());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("?symbol=sh600519");
    const body = (await response.json()) as {
      rows: { href: string; publishedOn: string | null; title: string }[];
    };

    expect(response.status).toBe(200);
    /*
     * 代码必须真的进到发给上游的那次请求里。只断言回包内容的话，
     * 「参数收下了但没用」照样能过——那正是这次的 bug。
     */
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("600519");

    expect(body.rows[0]?.title).toBe("贵州茅台2026年半年度报告");
    expect(body.rows[0]?.publishedOn).toBe("2026-08-18");
    expect(body.rows[0]?.href).toContain("600519");
  });

  it("never falls back to the market-wide feed for a symbol", async () => {
    /*
     * 这只票今天没有公告，是一个如实的答案。悄悄换成全市场最新几条，
     * 页面上会出现别人家的公告，而读的人没有任何办法看出来。
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(okJson({ data: { list: [] } }))),
    );

    const body = (await (await call("?symbol=sh600519")).json()) as {
      rows: unknown[];
    };

    expect(body.rows).toEqual([]);
  });

  it("rejects a code it cannot recognise instead of guessing", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve(perStock());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("?symbol=..%2F..%2Fetc%2Fpasswd");

    expect(response.status).toBe(400);
    /* 认不出来就一次上游都不该发。 */
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still serves the whole-market feed when no symbol is given", async () => {
    /* 7×24 那一页用的就是这一支，不能被改坏。 */
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(marketWide())),
    );

    const body = (await (await call("")).json()) as {
      rows: { name: string }[];
    };

    expect(body.rows[0]?.name).toBe("爱丽家居");
  });
});
