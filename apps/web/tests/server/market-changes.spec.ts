import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadMarketChanges,
  timeOfDay,
} from "../../src/server/market-changes.server";

/*
 * 盘口异动。
 *
 * 这一项此前被我判成「免费接口拒绝服务，做不了」——那是错的：缺的只是
 * `dpt=wzchanges` 参数。这一份连同那个参数一起钉住。
 *
 * 另外三件事，错了都不会报错，只会给出一张看起来正常的错表：
 *   1. 时间是不补零的整数，09:24:13 给的是 92413——按前两位切小时会读成
 *      92 点；
 *   2. 类型编码必须照数据源自己的对照表，不能照数据形态推断。我推断过一版，
 *      把 32 认成「封跌停板」，它其实是「打开跌停板」，方向正好相反；
 *   3. 北交所的票也会出现在异动里，而站内渲染不出来，不能给链接。
 *
 * 值是照真实结构改写的合成数据。
 */

const bodyOf = (allstock: readonly unknown[], tc = 9910): string =>
  JSON.stringify({ data: { allstock, tc }, rc: 0 });

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

describe("the timestamp is an unpadded integer", () => {
  it("reads a morning time without turning it into hour 92", () => {
    /*
     * 09:24:13 上游给的是 92413，只有五位。按前两位切小时会得到「92:41」——
     * 一个不存在的时刻，而那一行看起来只是时间怪了点。
     */
    expect(timeOfDay(92_413)).toBe("09:24:13");
    expect(timeOfDay(145_654)).toBe("14:56:54");
    expect(timeOfDay(93_000)).toBe("09:30:00");
  });

  it("refuses what is not a time", () => {
    for (const value of [-1, 1.5, 995_959, 246_000, "145654", null, undefined]) {
      expect(timeOfDay(value), String(value)).toBeNull();
    }
  });
});

describe("loading the day's anomalies", () => {
  it("names each type from the source's own dictionary", async () => {
    stubUpstream(
      bodyOf([
        { c: "002827", m: 0, n: "示例民爆", t: 8, tm: 145_654 },
        { c: "600578", m: 1, n: "示例电力", t: 16, tm: 145_654 },
        { c: "000767", m: 0, n: "示例电力二", t: 8201, tm: 145_530 },
      ]),
    );

    const changes = await loadMarketChanges();

    /*
     * 这三项的方向按数据形态很容易推反。8 是封跌停板（跌）、16 是打开涨停板
     * （跌）、8201 是火箭发射（涨）——照抄数据源的对照表才不会错。
     */
    expect(changes?.rows.map((row) => `${row.label}/${row.tone}`)).toEqual([
      "封跌停板/down",
      "打开涨停板/down",
      "火箭发射/up",
    ]);
    expect(changes?.total).toBe(9910);
  });

  it("sends the parameter the endpoint refuses to work without", async () => {
    stubUpstream(bodyOf([{ c: "002827", m: 0, n: "示例", t: 8, tm: 145_654 }]));

    await loadMarketChanges();

    // 少了 dpt 上游回 rc:102——我上一轮正是因此误判这项做不了。
    expect(requested).toContain("dpt=wzchanges");
  });

  it("sends the type list with commas the endpoint understands", async () => {
    stubUpstream(bodyOf([{ c: "002827", m: 0, n: "示例", t: 8, tm: 145_654 }]));

    await loadMarketChanges();

    /*
     * 逗号必须原样发出去。
     *
     * 上游对 `%2C` 的处理是：只认第一个类型，其余全部丢掉——不报错，
     * 照常回 200，回来的是一张满屏「火箭发射」的表，看上去完全正常。
     * 我第一版用 URLSearchParams 拼串，正好踩中：当日 9910 条异动
     * 变成了 2097 条，而页面上看不出任何异样。
     */
    expect(requested).not.toContain("%2C");
    expect(requested).toContain("type=8201,8202,8193,4,32,64,");
    expect(requested).toContain(",8214,8216&");
  });

  it("links only what this site can render", async () => {
    stubUpstream(
      bodyOf([
        { c: "600519", m: 1, n: "沪市样例", t: 8201, tm: 145_530 },
        { c: "920367", m: 0, n: "北交所样例", t: 8201, tm: 145_530 },
      ]),
    );

    const changes = await loadMarketChanges();

    expect(changes?.rows[0]?.href).toBe("/instruments/sh600519");
    // 北交所站内渲染不出来：给了链接就是点进去 404。
    expect(changes?.rows[1]?.href).toBeNull();
  });

  it("drops a row whose type it cannot name", async () => {
    stubUpstream(
      bodyOf([
        { c: "600519", m: 1, n: "认得的", t: 8201, tm: 145_530 },
        { c: "600520", m: 1, n: "认不得的", t: 99_999, tm: 145_530 },
      ]),
    );

    const changes = await loadMarketChanges();

    // 一条说不清是什么异动的记录，列出来没有意义。
    expect(changes?.rows).toHaveLength(1);
    expect(changes?.rows[0]?.name).toBe("认得的");
  });

  it("clamps how many rows a caller can ask for", async () => {
    stubUpstream(
      bodyOf([{ c: "600519", m: 1, n: "样例", t: 8201, tm: 145_530 }]),
    );

    await loadMarketChanges(100_000);

    // 这个接口不鉴权，不封顶就等于替调用方去拉全天九千多条。
    expect(requested).toContain("pagesize=30");
  });

  it("returns nothing when upstream gives nothing usable", async () => {
    stubUpstream(null);
    expect(await loadMarketChanges()).toBeNull();

    // 空列表会被读成「今天没有异动」，那是另一回事。
    stubUpstream(bodyOf([]));
    expect(await loadMarketChanges()).toBeNull();
  });
});
