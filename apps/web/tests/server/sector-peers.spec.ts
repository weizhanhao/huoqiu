import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSectorPeers } from "../../src/server/sector-peers.server";

/*
 * 相关股票。
 *
 * 雪球个股页右栏有一块「相关股票」，列的是同行业的几只，带实时涨跌。
 * 站内此前整条右栏都没有。
 *
 * 「相关」得有个说法。这里用的是上游给的所属板块（f198，长鑫科技是
 * BK1036 半导体），再按板块拉成分股——不是按名字像不像，也不是随手
 * 挑几只热门的凑数。
 *
 * 两件事错了不会报错：把自己也列进「相关股票」（一只股票和自己相关，
 * 这一栏就白占一格），以及板块取不到时拿别的东西顶上。
 *
 * 值是照真实结构改写的合成数据。
 */

const quoteBody = (overrides: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    data: {
      f57: "688825",
      f58: "长鑫科技",
      f127: "半导体",
      f198: "BK1036",
      ...overrides,
    },
    rc: 0,
  });

const peersBody = (
  rows: readonly Readonly<Record<string, unknown>>[],
): string =>
  JSON.stringify({ data: { diff: rows, total: rows.length }, rc: 0 });

const PEERS = [
  { f12: "688286", f13: 1, f14: "敏芯股份", f2: 52.35, f3: 17.3 },
  { f12: "301348", f13: 0, f14: "蓝箭电子", f2: 22.6, f3: 12.16 },
  { f12: "688825", f13: 1, f14: "长鑫科技", f2: 54.96, f3: 3.93 },
];

const requested: string[] = [];

const stub = (handler: (url: string) => string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    const payload = handler(url);
    if (payload === null) return new Response("", { status: 200 });
    return new Response(payload, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested.length = 0;
});

describe("finding stocks in the same sector", () => {
  it("asks the board the stock actually belongs to", async () => {
    stub((url) => (url.includes("clist") ? peersBody(PEERS) : quoteBody()));

    const result = await loadSectorPeers("sh688825");

    expect(result?.sectorName).toBe("半导体");
    // 板块代码来自上游，不是按名字猜的。
    expect(
      requested.some(
        (url) => url.includes("fs=b%3ABK1036") || url.includes("fs=b:BK1036"),
      ),
    ).toBe(true);
  });

  it("does not list the stock as related to itself", async () => {
    /*
     * 成分股里必然包含它自己。不剔掉的话，「相关股票」第一条就是当前
     * 这只——占掉一格，还让人以为点错了页面。
     */
    stub((url) => (url.includes("clist") ? peersBody(PEERS) : quoteBody()));

    const result = await loadSectorPeers("sh688825");

    expect(result?.peers.map((peer) => peer.symbol)).toEqual([
      "sh688286",
      "sz301348",
    ]);
  });

  it("gives each peer a working link", async () => {
    // f13 决定前缀：1 是沪市、0 是深市。贴反了会指向另一只股票。
    stub((url) => (url.includes("clist") ? peersBody(PEERS) : quoteBody()));

    const result = await loadSectorPeers("sh688825");

    expect(result?.peers[0]).toMatchObject({
      changePercent: 17.3,
      last: 52.35,
      name: "敏芯股份",
      symbol: "sh688286",
    });
  });

  it("returns nothing when the stock has no sector", async () => {
    /*
     * 指数拿不到板块代码。这时整块不给——退一步随便列几只热门股当
     * 「相关」，那是编造关联。
     *
     * 这里必须用一个能过代码格式那一关的沪深代码（上证指数 sh000001）。
     * 我第一版传的是 hk00700，函数在格式校验那一步就返回了，根本没走到
     * 板块判断——用例是绿的，测的却是另一件事。
     */
    stub((url) =>
      url.includes("clist")
        ? peersBody(PEERS)
        : quoteBody({ f127: null, f198: null }),
    );

    expect(await loadSectorPeers("sh000001")).toBeNull();
    // 没有板块就不该再去问成分股。
    expect(requested.some((url) => url.includes("clist"))).toBe(false);
  });

  it("refuses a code that has no sector concept at all", async () => {
    // 港美股不走这条路：那边根本没有 A 股这套板块编号。
    stub(() => quoteBody());

    expect(await loadSectorPeers("hk00700")).toBeNull();
    expect(await loadSectorPeers("usaapl")).toBeNull();
    // 一次请求都不该发。
    expect(requested).toHaveLength(0);
  });

  it("falls back to the delayed source when the main one throws", async () => {
    /*
     * 主源会突然掐断连接（UND_ERR_SOCKET），fetch 直接抛，不是回一个错误码。
     * 把两次尝试套在同一个 try 里，主源一抛就跳进 catch——延时源那一路
     * 永远轮不到，而代码读起来像是有回退的。
     */
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("//push2.eastmoney.com")) {
        throw new TypeError("fetch failed");
      }
      return new Response(
        url.includes("clist") ? peersBody(PEERS) : quoteBody(),
        { status: 200 },
      );
    });

    const result = await loadSectorPeers("sh688825");

    expect(result?.sectorName).toBe("半导体");
    expect(requested.some((url) => url.includes("push2delay"))).toBe(true);
  });

  it("returns nothing when upstream fails", async () => {
    stub(() => null);
    expect(await loadSectorPeers("sh688825")).toBeNull();
  });
});
