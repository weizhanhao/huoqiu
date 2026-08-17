import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../src/app/api/market/research/route";

/*
 * 券商研报接口。
 *
 * 取数层一直都在，网页版个股页用的就是它——只是从没对外开过口子，手机端够
 * 不着，于是手机端个股页那一档挂的是全市场 ETF 列表：每只票点开列的都一样。
 *
 * 这条接口守的是「按代码查」这件事本身：代码必须真的进到发给上游的那次请求
 * 里，认不出来的代码一次上游都不发。
 */

const okJson = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

/** 东财研报接口的回包形状。 */
const upstream = (): Response =>
  okJson({
    data: [
      {
        emRatingName: "买入",
        indvAimPriceT: "1680.00",
        infoCode: "AP202608180001",
        orgSName: "某某证券",
        predictThisYearEps: "68.20",
        publishDate: "2026-08-18 00:00:00",
        title: "贵州茅台：中报点评",
      },
      {
        /* 没有编号——构造不出正文链接，读者无从核对，不该列。 */
        emRatingName: "增持",
        orgSName: "另一家证券",
        publishDate: "2026-08-17 00:00:00",
        title: "一条没有编号的研报",
      },
    ],
  });

let cacheDirectory = "";

beforeEach(() => {
  /* 研报按代码缓存在磁盘上，用例之间共用目录会互相读到对方的结果。 */
  cacheDirectory = mkdtempSync(resolve(tmpdir(), "huoqiu-research-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", cacheDirectory);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(cacheDirectory, { force: true, recursive: true });
});

const call = (query: string): Promise<Response> =>
  GET(new Request(`https://huoqiu.test/api/market/research${query}`));

describe("research route", () => {
  it("asks upstream for that one symbol", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve(upstream());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("?symbol=sh600519");
    const body = (await response.json()) as {
      reports: {
        href: string;
        institution: string | null;
        publishedOn: string | null;
        rating: string | null;
        targetPrice: number | null;
      }[];
    };

    expect(response.status).toBe(200);
    /* 代码要真的进到请求里——「参数收下了但没用」正是这一档此前的毛病。 */
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("600519");

    expect(body.reports[0]?.institution).toBe("某某证券");
    expect(body.reports[0]?.rating).toBe("买入");
    expect(body.reports[0]?.targetPrice).toBe(1680);
    expect(body.reports[0]?.publishedOn).toBe("2026-08-18");
    expect(body.reports[0]?.href).toContain("AP202608180001");

    /* 没编号的那条打不开正文，不列。 */
    expect(body.reports).toHaveLength(1);
  });

  it("rejects a code it cannot recognise instead of guessing", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve(upstream());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("?symbol=hk00700");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says it could not fetch rather than returning an empty list", async () => {
    /*
     * 空列表会被读成「没有券商写过这只票」——那是一句关于这家公司的判断，
     * 而事实只是我们没问到。
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("upstream down"))),
    );

    const response = await call("?symbol=sh600519");

    expect(response.status).toBe(503);
  });
});
