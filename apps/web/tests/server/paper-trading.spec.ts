import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOT_SIZE,
  listOrders,
  listPositions,
  recordOrder,
} from "../../src/server/paper-trading";

/*
 * 模拟交易的账本。
 *
 * 雪球的「交易」是券商对接，那需要真实牌照与真实资金，做不了也不该假装做。
 * 但雪球同样有「模拟交易」：用真实价格记一笔虚拟买卖，看自己的判断对不对。
 * 这一份做的是后者——价格是真的，盈亏照真实价格算，只有钱是虚拟的。
 *
 * 三件事错了不会报错，只会得到一个看起来正常的账本：
 *   1. 成交价必须由服务端取。信客户端提交的价格等于允许「1 块钱买茅台」；
 *      这一层只接受调用方已经取到的价，而调用方（路由）必须自己去行情接口取，
 *      那一点由路由的用例守；
 *   2. A 股按手交易，一手 100 股。允许 37 股，持仓从第一笔起就不成立；
 *   3. 卖出不能超过持仓。允许卖空会算出一个负持仓，而模拟盘里没有融券。
 */

const SECRET = "session-secret-for-tests-0123456789abcdef";
let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-trade-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const buy = (shares: number, price: number, at = "2026-08-14T01:00:00.000Z") =>
  recordOrder({
    accountId: "acct_1",
    now: at,
    price,
    shares,
    side: "buy",
    symbol: "sh600519",
  });

describe("placing an order", () => {
  it("records a buy and opens a position at its cost", () => {
    const result = buy(100, 1500);

    expect("error" in result).toBe(false);
    const positions = listPositions("acct_1");
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      averageCost: 1500,
      shares: 100,
      symbol: "sh600519",
    });
  });

  it("averages the cost across several buys", () => {
    buy(100, 1000);
    buy(300, 2000);

    // (100×1000 + 300×2000) / 400 = 1750
    expect(listPositions("acct_1")[0]?.averageCost).toBe(1750);
    expect(listPositions("acct_1")[0]?.shares).toBe(400);
  });

  it("refuses anything that is not a whole lot", () => {
    /*
     * A 股按手交易，一手 100 股。允许 37 股，持仓从第一笔起就不成立，
     * 而界面上看不出哪里不对。
     */
    expect(LOT_SIZE).toBe(100);
    for (const shares of [0, -100, 37, 150, 1.5, Number.NaN]) {
      const result = buy(shares, 1500);
      expect("error" in result, String(shares)).toBe(true);
    }
    expect(listPositions("acct_1")).toHaveLength(0);
  });

  it("refuses a price that is not a positive number", () => {
    // 价格由调用方从行情接口取；取不到时不能记成 0，那会算出无限收益率。
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect("error" in buy(100, price), String(price)).toBe(true);
    }
  });
});

describe("selling", () => {
  it("reduces the position and keeps the average cost", () => {
    buy(500, 1000);

    const result = recordOrder({
      accountId: "acct_1",
      now: "2026-08-14T02:00:00.000Z",
      price: 1200,
      shares: 200,
      side: "sell",
      symbol: "sh600519",
    });

    expect("error" in result).toBe(false);
    const position = listPositions("acct_1")[0];
    // 卖出不改变剩余持仓的成本价，只减少股数。
    expect(position).toMatchObject({ averageCost: 1000, shares: 300 });
  });

  it("will not sell more than is held", () => {
    buy(100, 1000);

    const result = recordOrder({
      accountId: "acct_1",
      now: "2026-08-14T02:00:00.000Z",
      price: 1200,
      shares: 200,
      side: "sell",
      symbol: "sh600519",
    });

    // 模拟盘里没有融券。允许卖空会算出一个负持仓。
    expect("error" in result).toBe(true);
    expect(listPositions("acct_1")[0]?.shares).toBe(100);
  });

  it("closes the position out entirely when the last lot goes", () => {
    buy(100, 1000);
    recordOrder({
      accountId: "acct_1",
      now: "2026-08-14T02:00:00.000Z",
      price: 1200,
      shares: 100,
      side: "sell",
      symbol: "sh600519",
    });

    // 清仓之后不该留下一条 0 股的持仓——那读起来像还持有。
    expect(listPositions("acct_1")).toHaveLength(0);
  });
});

describe("whose ledger it is", () => {
  it("keeps each account's positions and orders to itself", () => {
    buy(100, 1000);
    recordOrder({
      accountId: "acct_2",
      now: "2026-08-14T01:00:00.000Z",
      price: 20,
      shares: 200,
      side: "buy",
      symbol: "sz000001",
    });

    expect(listPositions("acct_1").map((position) => position.symbol)).toEqual([
      "sh600519",
    ]);
    expect(listPositions("acct_2").map((position) => position.symbol)).toEqual([
      "sz000001",
    ]);
    expect(listOrders("acct_1")).toHaveLength(1);
    expect(listOrders("acct_2")).toHaveLength(1);
  });

  it("lists the newest order first", () => {
    buy(100, 1000, "2026-08-14T01:00:00.000Z");
    buy(100, 1100, "2026-08-14T03:00:00.000Z");
    buy(100, 1050, "2026-08-14T02:00:00.000Z");

    expect(listOrders("acct_1").map((order) => order.price)).toEqual([
      1100, 1050, 1000,
    ]);
  });
});
