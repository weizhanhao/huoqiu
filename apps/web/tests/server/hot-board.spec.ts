import { afterEach, describe, expect, it, vi } from "vitest";

import { loadHotBoard } from "../../src/server/hot-board.server";

/*
 * 热股榜。
 *
 * 右栏这块此前排的是站内那 35 个虚构标的，涨跌幅是写死的常量：切市场、
 * 切涨跌榜都有反应，但每一行都不是真的。
 *
 * 这一份守三件事：
 *   1. 港股和美股的 diff 是**对象**（键为 "0"、"1"），沪深是数组。
 *      只按数组处理，那两栏会永远是空的——而界面上看起来就像那两个市场
 *      今天没有涨跌。
 *   2. 只有站内渲染得出来的标的才给链接。给别的也拼一个 /instruments/…，
 *      每一行都点得进去、每一次都是空页。
 *   3. 排序由上游做。只对本地这八行重排，得到的是「这八只里的顺序」，
 *      却会被读成「全市场涨得最多的八只」。
 *
 * 值是照真实结构改写的合成数据。
 */

let requested = "";

const stubUpstream = (diff: unknown): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (diff === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify({ data: { diff } }), { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
});

describe("the hot board reads both shapes the endpoint returns", () => {
  it("maps the numbered fields onto names a rail can render", async () => {
    stubUpstream([
      { f12: "600519", f13: 1, f14: "沪市样例", f2: 31.13, f3: 29.6 },
    ]);

    const board = await loadHotBoard("cn", "gainers");

    expect(board?.rows[0]).toEqual({
      changePercent: 29.6,
      code: "600519",
      href: "/instruments/sh600519",
      last: 31.13,
      name: "沪市样例",
    });
  });

  it("reads the object-shaped diff that Hong Kong and the US return", async () => {
    /*
     * 沪深回数组，港美回以 "0"、"1" 为键的对象。同一个接口两种形状，
     * 只处理数组的话港美两栏永远空着。
     */
    stubUpstream({
      "0": { f12: "06890", f13: 128, f14: "港股样例", f2: 0.645, f3: -25.86 },
      "1": { f12: "02630", f13: 128, f14: "另一只", f2: 96.35, f3: -24.55 },
    });

    const board = await loadHotBoard("hk", "losers");

    expect(board?.rows.map((row) => row.name)).toEqual(["港股样例", "另一只"]);
  });

  it("ranks the 全球 board across all three markets at once", async () => {
    /*
     * 「全球」这一栏我此前删掉了，理由是「把三个市场的涨跌幅混在一张表里
     * 排名没有可比意义」。那个理由站不住：涨跌幅本来就是无量纲的百分比，
     * 跨市场比较正是这一栏的用处。
     *
     * 关键是排名要交给上游做。只把本地这几行重排，得到的是「这几只里的
     * 顺序」，却会被读成「全球涨得最多的几只」——两者差着两万多只标的。
     * 所以这一栏必须是一次请求、一个 fs 把三个市场都圈进去。
     */
    let requestedFs = "";
    vi.stubGlobal("fetch", async (input: string | URL) => {
      requestedFs = new URL(String(input)).searchParams.get("fs") ?? "";
      return new Response(JSON.stringify({ data: { diff: [] } }), {
        status: 200,
      });
    });

    await loadHotBoard("global", "gainers");

    // 沪深、港股、美股的市场段都要在同一个 fs 里。
    expect(requestedFs).toContain("m:1+t:2");
    expect(requestedFs).toContain("m:128+t:3");
    expect(requestedFs).toContain("m:105");
  });

  it("links Hong Kong and US rows as well", async () => {
    /*
     * 这两栏此前每一行都是死文本，理由是「站内没有它们的详情页」。
     * 现在有了：港股 128、美股 105/106/107 都打得开，链接就该给。
     *
     * 港股代码补到五位——上游多数时候给的就是 00700，但给 700 的时候
     * 不补零会拼出一个打不开的地址。
     */
    stubUpstream([
      { f12: "00700", f13: 128, f14: "腾讯样例", f2: 443.2, f3: 0.5 },
    ]);
    expect((await loadHotBoard("hk", "gainers"))?.rows[0]?.href).toBe(
      "/instruments/hk00700",
    );

    stubUpstream([
      { f12: "AAPL", f13: 105, f14: "苹果样例", f2: 305.26, f3: 1 },
    ]);
    // 站内地址一律小写。
    expect((await loadHotBoard("us", "gainers"))?.rows[0]?.href).toBe(
      "/instruments/usaapl",
    );
  });

  it("does not link a listing this site cannot render", async () => {
    /*
     * 北交所的 92xxxx 没有站内详情页。照样拼一个 /instruments/… 的话，
     * 用户点进去看到的是一张空页——比不给链接更糟，因为它先许诺了
     * 点得进去。
     */
    stubUpstream([
      { f12: "920367", f13: 0, f14: "北交所样例", f2: 31.13, f3: 29.6 },
      { f12: "300404", f13: 0, f14: "创业板样例", f2: 14.45, f3: 20.02 },
    ]);

    const board = await loadHotBoard("cn", "gainers");

    expect(board?.rows[0]?.href).toBeNull();
    expect(board?.rows[1]?.href).toBe("/instruments/sz300404");
  });

  it("keeps the Beijing exchange out of the 沪深 board", async () => {
    stubUpstream([
      { f12: "600519", f13: 1, f14: "沪市样例", f2: 31.13, f3: 29.6 },
    ]);

    await loadHotBoard("cn", "gainers");

    /*
     * 北交所（m:0+t:81+s:2048）的涨跌幅上限是 30%，混进 20%/10% 的沪深榜
     * 会长期霸占前几名，而站内没有它们的详情页——每一行都是点不动的死文本，
     * 页面说明里也只提了港美股。
     */
    expect(requested).not.toContain("t%3A81");
    expect(requested).not.toContain("s%3A2048");
  });

  it("asks the endpoint to do the ordering", async () => {
    stubUpstream([
      { f12: "600519", f13: 1, f14: "沪市样例", f2: 31.13, f3: 29.6 },
    ]);

    await loadHotBoard("us", "losers");

    // po=0 升序即跌幅榜；改在本地重排会把「全市场」说成「这八只」。
    expect(requested).toContain("po=0");
    expect(requested).toContain("fid=f3");
    expect(requested).toContain("m%3A105");
  });

  it("clamps how many rows a caller can ask for", async () => {
    stubUpstream([
      { f12: "600519", f13: 1, f14: "沪市样例", f2: 31.13, f3: 29.6 },
    ]);

    /*
     * 这个接口不鉴权。不封顶的话，一个 ?rows=100000 就能让它去替调用方
     * 拉整个市场——上游挨压，本进程也要把那份响应读进内存。
     */
    await loadHotBoard("cn", "gainers", 100_000);
    expect(requested).toContain("pz=50");

    // 不成形的条数回落到默认，而不是原样传给上游。
    await loadHotBoard("cn", "gainers", Number.NaN);
    expect(requested).toContain("pz=8");

    await loadHotBoard("cn", "gainers", 30);
    expect(requested).toContain("pz=30");
  });

  it("returns nothing when upstream gives nothing usable", async () => {
    stubUpstream(null);
    expect(await loadHotBoard("cn", "gainers")).toBeNull();

    // 空列表会被读成「这个市场今天没有涨跌」，那是另一回事。
    stubUpstream([]);
    expect(await loadHotBoard("cn", "gainers")).toBeNull();
  });
});
