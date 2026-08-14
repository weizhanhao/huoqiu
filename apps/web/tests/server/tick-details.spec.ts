import { afterEach, describe, expect, it, vi } from "vitest";

import { loadTickDetails } from "../../src/server/tick-details.server";

/*
 * 成交明细。
 *
 * 雪球图右下角那一列：时间、成交价、手数，买盘红、卖盘绿。站内此前没有。
 *
 * 方向那一位是这里最阴的东西。网上普遍写的是「1=买 2=卖」，而拿真实数据
 * 对了一遍，结论正好相反：
 *   方向=1 时价降 53 次、价升 4 次
 *   方向=2 时价升 45 次、价降 4 次
 * 也就是 1 是卖盘、2 是买盘。照通行说法映射，每一笔的红绿都是反的——
 * 而那张表看起来完全正常，没有任何一行能让人起疑。
 *
 * 另一件事：这个接口只有东财有（腾讯没有对应的 controller），而东财那两个
 * 源在服务端会成片断连——主源抛异常时必须真的能落到延时源上，不能两路
 * 套在同一个 try 里。
 *
 * 值是照真实结构改写的合成数据。
 */

const body = (rows: readonly string[], prePrice = 1355.29): string =>
  JSON.stringify({ data: { details: rows, prePrice }, rc: 0 });

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

describe("reading the tape", () => {
  it("reads time, price and volume off each print", async () => {
    stub(() => body(["13:45:52,1339.19,11,8,1"]));

    const tape = await loadTickDetails("sh600519");

    expect(tape?.ticks[0]).toMatchObject({
      price: 1339.19,
      time: "13:45:52",
      // 11 手 = 1100 股。
      volumeShares: 1100,
    });
  });

  it("maps the direction flag the way the data actually behaves", async () => {
    /*
     * 1 是卖、2 是买——和通行说法反着。这一条错了，整张表的红绿全反，
     * 而每一行看起来都对。
     */
    stub(() => body(["13:45:52,1339.19,11,8,1", "13:45:55,1339.89,2,2,2"]));

    const tape = await loadTickDetails("sh600519");

    expect(tape?.ticks.find((tick) => tick.time === "13:45:52")?.side).toBe(
      "sell",
    );
    expect(tape?.ticks.find((tick) => tick.time === "13:45:55")?.side).toBe(
      "buy",
    );
  });

  it("counts Hong Kong prints in shares, not lots", async () => {
    // 港股那一列给的已经是股，再乘 100 就大了一百倍。
    stub(() => body(["09:30:01,436.000,1200,3,2"]));

    expect((await loadTickDetails("hk00700"))?.ticks[0]?.volumeShares).toBe(
      1200,
    );
  });

  it("puts the newest print first", async () => {
    // 上游是从早到晚给的，看盘要的是最近几笔。
    stub(() => body(["13:45:52,1339.19,11,8,1", "13:46:13,1338.88,12,3,2"]));

    expect((await loadTickDetails("sh600519"))?.ticks[0]?.time).toBe("13:46:13");
  });

  it("falls back to the delayed source when the main one throws", async () => {
    /*
     * 主源掐断连接时 fetch 是直接抛，不是回错误码。两路套在同一个 try 里，
     * 主源一抛就跳进 catch——延时源永远轮不到，而代码读起来像是有回退的。
     * 这个接口只有东财有，没有第二家可换，回退必须真的管用。
     */
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("//push2.eastmoney.com")) {
        throw new TypeError("fetch failed");
      }
      return new Response(body(["13:45:52,1339.19,11,8,1"]), { status: 200 });
    });

    const tape = await loadTickDetails("sh600519");

    expect(tape?.ticks).toHaveLength(1);
    expect(requested.some((url) => url.includes("push2delay"))).toBe(true);
  });

  it("returns nothing when there is nothing to show", async () => {
    stub(() => body([]));
    expect(await loadTickDetails("sh600519")).toBeNull();

    stub(() => null);
    expect(await loadTickDetails("sh600519")).toBeNull();
  });
});
