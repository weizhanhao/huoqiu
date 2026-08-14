import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadMoneyFlow,
  loadTickBoard,
  parseTick,
  priceLevelsOf,
  type Tick,
} from "../../src/server/tick.server";

/*
 * 逐笔成交与它派生的两张表。
 *
 * 站内此前把成交明细、分价表、大单统计三项标成「需要 Level-2 数据，
 * 免费源给不全」，链到腾讯去。那句话是错的——公开逐笔接口就能取到全天成交。
 *
 * 这一份守四件事，每一件错了都不会有报错，只会安静地给出一张看起来正常的
 * 错表：
 *   1. 方向的语义是 2 买 1 卖，不是想当然的 1 买 2 卖；
 *   2. 方向 4 是集合竞价参考量，不是成交，必须剔除；
 *   3. 第四列是这个切片内的**笔数**，不是 1——用行数当笔数会低十几倍；
 *   4. 15:01 之后的盘后成交不计入当日，必须剔除。
 *
 * 另外：大单统计不再由这份数据自行分档。它是按秒聚合的切片而非单笔，
 * 据它分档得到的方向与官方口径相反，所以那张表改用官方资金流接口。
 *
 * 值是照真实结构改写的合成数据。
 */

const bodyOf = (details: readonly string[]): string =>
  JSON.stringify({
    data: { code: "600519", decimal: 2, details, market: 1, prePrice: 1343 },
  });

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async () => {
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("one row of the tick feed", () => {
  it("reads direction 2 as an aggressive buy and 1 as an aggressive sell", () => {
    /*
     * 反过来的话，整张成交明细的买卖两色会全部对调，而表本身看着毫无问题。
     * 依据：价格上跳的那些笔绝大多数是方向 2，且方向 2 的全天合计对应
     * 快照里较大的那个外盘数。
     */
    expect(parseTick("09:30:01,1350.00,2,1,2")?.side).toBe("buy");
    expect(parseTick("09:30:05,1349.00,3,2,1")?.side).toBe("sell");
  });

  it("throws away the pre-open auction rows", () => {
    /*
     * 09:25 之前方向为 4 的是集合竞价参考量，不是成交。实测那一段有
     * 10073 手，占全天真实成交量的 31%——留着会把开盘价那一档堆高三成。
     */
    expect(parseTick("09:15:04,1335.00,11,0,4")).toBeNull();
  });

  it("throws away rows it cannot read", () => {
    for (const raw of [
      "09:30:01,1350.00,2", // 列不齐
      "not-a-time,1350.00,2,1,2",
      "09:30:01,-,2,1,2", // 价格缺失
      "09:30:01,1350.00,0,1,2", // 零手不是成交
    ]) {
      expect(parseTick(raw), raw).toBeNull();
    }
  });
});

describe("the price ladder", () => {
  const ticks: readonly Tick[] = [
    { at: "09:30:01", price: 1350, side: "buy", trades: 1, volumeHands: 2 },
    { at: "09:30:05", price: 1349, side: "sell", trades: 1, volumeHands: 3 },
    { at: "09:31:00", price: 1350, side: "sell", trades: 1, volumeHands: 1 },
    { at: "09:32:00", price: 1351, side: "buy", trades: 1, volumeHands: 5 },
  ];

  it("adds up each price and keeps buy and sell apart", () => {
    const levels = priceLevelsOf(ticks);

    // 高价在上，与盘口的读法一致。
    expect(levels.map((level) => level.price)).toEqual([1351, 1350, 1349]);
    expect(levels[1]).toEqual({
      buyHands: 2,
      price: 1350,
      sellHands: 1,
      totalHands: 3,
    });
  });

  it("has each level's total equal its own buy plus sell", () => {
    // 三个数对不上的话，那一行自己就自相矛盾。
    for (const level of priceLevelsOf(ticks)) {
      expect(level.totalHands).toBe(level.buyHands + level.sellHands);
    }
  });
});

describe("loading a whole day of ticks", () => {
  it("keeps only the real trades and derives both tables", async () => {
    stubUpstream(
      bodyOf([
        "09:15:04,1335.00,11,0,4",
        "09:30:01,1350.00,2,1,2",
        "09:30:05,1349.00,3,2,1",
      ]),
    );

    const board = await loadTickBoard("sh600519");

    expect(board?.ticks).toHaveLength(2);
    expect(board?.prevClose).toBe(1343);
    expect(board?.levels.map((level) => level.price)).toEqual([1350, 1349]);
  });

  it("counts trades from the fourth column, not from the row count", async () => {
    /*
     * 每一行是一个按秒聚合的切片，第四列才是这个切片里的笔数。
     * 用行数当笔数，实测会把 601398 的 13.2 万笔说成 4900 笔——低十几倍。
     */
    stubUpstream(
      bodyOf([
        "09:30:01,1350.00,20,7,2",
        "09:30:05,1349.00,30,11,1",
        "15:00:05,1355.00,402,231,1",
      ]),
    );

    const board = await loadTickBoard("sh600519");

    expect(board?.ticks).toHaveLength(3);
    expect(board?.trades).toBe(7 + 11 + 231);
  });

  it("drops what trades after the close", async () => {
    /*
     * 15:00:59 之后还有盘后固定价格与大宗回报，它们不计入当日成交量，
     * 却全部印在收盘价上——留着会在分价表的收盘价那一档堆出一根假的长条。
     */
    stubUpstream(
      bodyOf(["09:30:01,1350.00,20,7,2", "15:05:03,1355.00,4000,1,1"]),
    );

    const board = await loadTickBoard("sh600519");

    expect(board?.ticks).toHaveLength(1);
    expect(board?.levels.map((level) => level.price)).toEqual([1350]);
  });

  it("refuses a code it will not address", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(bodyOf(["09:30:01,1350.00,2,1,2"]), { status: 200 });
    });

    for (const symbol of ["listing_syn_0001", "600519", "hk00700", ""]) {
      expect(await loadTickBoard(symbol), symbol).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when the day has no real trades", async () => {
    // 只有集合竞价参考量：一笔都没成交，不该给出一张空表当作「成交明细」。
    stubUpstream(bodyOf(["09:15:04,1335.00,11,0,4"]));
    expect(await loadTickBoard("sh600519")).toBeNull();

    stubUpstream(null);
    expect(await loadTickBoard("sh600519")).toBeNull();
  });

  it("falls back to the delayed source and says so", async () => {
    /*
     * 主源对这个端点会限流，回的是空响应体——JSON.parse 直接抛。
     * 一份晚十几分钟的真数据比一张空表有用，但要如实标出它是延时的。
     */
    vi.stubGlobal("fetch", async (input: string | URL) => {
      if (String(input).includes("push2delay")) {
        return new Response(bodyOf(["09:30:01,1350.00,2,1,2"]), {
          status: 200,
        });
      }
      return new Response("", { status: 200 });
    });

    const board = await loadTickBoard("sh600519");

    expect(board?.ticks).toHaveLength(1);
    expect(board?.delayed).toBe(true);
  });
});

/*
 * 资金流。
 *
 * 这四个数不是站内算的。站内自己按分时切片分过一次档，结果与东财官方口径
 * 在个股上符号相反——平安银行站内算出特大单净 −0.79 亿，官方是 +0.56 亿。
 * 原因是那份数据按秒聚合，一行不是一笔。
 */
describe("money flow comes from the official endpoint", () => {
  const FLOW_ROW = {
    f12: "600519",
    f62: 358_946_672,
    f66: 117_576_288,
    f69: 2.69,
    f72: 241_370_384,
    f75: 5.52,
    f78: -358_666_544,
    f81: -8.2,
    f84: -280_123,
    f87: -0.01,
  };

  it("maps each tier onto the number the page renders", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: { diff: [FLOW_ROW] } }), {
        status: 200,
      }),
    );

    const flow = await loadMoneyFlow("sh600519");

    expect(flow?.mainNetAmount).toBe(358_946_672);
    expect(flow?.tiers.map((tier) => tier.slug)).toEqual([
      "huge",
      "large",
      "medium",
      "small",
    ]);
    expect(flow?.tiers[0]).toEqual({
      label: "超大单",
      netAmount: 117_576_288,
      netPercent: 2.69,
      slug: "huge",
    });
  });

  it("has the four tiers net out to zero", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: { diff: [FLOW_ROW] } }), {
        status: 200,
      }),
    );

    const flow = await loadMoneyFlow("sh600519");
    const total = (flow?.tiers ?? []).reduce(
      (sum, tier) => sum + tier.netAmount,
      0,
    );

    /*
     * 每一笔买都有对应的卖，所以四档净额相加必须是零。
     * 这是这份数据自带的自检——对不上就说明取错了字段。
     */
    expect(Math.abs(total)).toBeLessThan(10);
  });

  it("returns nothing rather than a table of zeros", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: { diff: [{ f12: "600519" }] } }), {
        status: 200,
      }),
    );

    // 一档都没取到就是没取到，不给一张四行全零的表——那读起来像「今天没有资金流」。
    expect(await loadMoneyFlow("sh600519")).toBeNull();
  });

  it("refuses a code it will not address", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    expect(await loadMoneyFlow("listing_syn_0001")).toBeNull();
    expect(calls).toBe(0);
  });
});
