import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as tradeGet,
  POST as tradePost,
} from "../../src/app/api/trade/route";
import { resetListQuoteCache } from "../../src/server/market-list.server";
import { listOrders } from "../../src/server/paper-trading";
import { issueSession } from "../../src/server/session";
import { registerAccount } from "../../src/server/social-store";

/*
 * 模拟交易的下单接口。
 *
 * 这里守的是整个功能里最要紧的一条：**成交价由服务端取，请求体里的价格
 * 一概不看**。信了客户端，「1 块钱买茅台」就成立，而账本上看不出任何异常
 * ——持仓、成本、盈亏全都自洽，只是从头到尾是假的。
 *
 * 行情用 stub，不联网。
 */

const SECRET = "session-secret-for-tests-0123456789abcdef";
let directory = "";

/** 上游行情：贵州茅台报 1355.29。 */
const quotePayload = JSON.stringify({
  data: { diff: [{ f2: 1355.29, f12: "600519", f13: 1, f14: "贵州茅台" }] },
  rc: 0,
});

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-trade-route-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(directory, { force: true, recursive: true });
});

const signedInAccount = () => {
  const result = registerAccount({
    displayName: "下单人",
    email: `trader-${String(Math.trunc(performance.now() * 1000))}@example.com`,
    now: "2026-08-14T00:00:00.000Z",
    password: "Correct-Horse-9",
  });
  if ("error" in result) throw new Error(result.error);
  return {
    id: result.account.id,
    token: issueSession(result.account.id, Date.now() / 1000) ?? "",
  };
};

const orderRequest = (body: unknown, token?: string): Request =>
  new Request("https://example.test/api/trade", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method: "POST",
  });

describe("who may trade", () => {
  it("refuses an order from nobody", async () => {
    const response = await tradePost(
      orderRequest({ shares: 100, side: "buy", symbol: "sh600519" }),
    );

    expect(response.status).toBe(401);
  });

  it("refuses to show a ledger to nobody", async () => {
    const response = await tradeGet(
      new Request("https://example.test/api/trade"),
    );

    // 持仓是「我的」，不是公开数据。
    expect(response.status).toBe(401);
  });
});

describe("what the fill price comes from", () => {
  it("ignores a price supplied by the caller", async () => {
    const { id, token } = signedInAccount();
    vi.stubGlobal(
      "fetch",
      async () => new Response(quotePayload, { status: 200 }),
    );

    const response = await tradePost(
      orderRequest(
        // 攻击者提交一个自己想要的价格。
        { price: 1, shares: 100, side: "buy", symbol: "sh600519" },
        token,
      ),
    );
    const data = (await response.json()) as { order?: { price: number } };

    /*
     * 成交价必须是行情接口给的 1355.29，不是请求体里的 1。
     * 差别在账本上看不出来——持仓、成本、盈亏都会自洽。
     */
    expect(response.status).toBe(201);
    expect(data.order?.price).toBe(1355.29);
    expect(listOrders(id)[0]?.price).toBe(1355.29);
  });

  it("records nothing when the quote cannot be had", async () => {
    const { id, token } = signedInAccount();
    /*
     * 先清行情缓存。
     *
     * 取数层有一个 2 秒的微缓存（market-list.server.ts 的 MICRO_CACHE_MS）。
     * 不清的话，上一条用例刚取到的 1355.29 还在缓存里，这一条即使把上游
     * 打成 500 也照样成交——第一次写这条时就是这样，返回了 201。
     *
     * 顺带说明那个缓存本身没问题：两秒内的价就是用户刚在屏幕上看到的价，
     * 拿它成交是对的。这里要测的是缓存也没有时的行为。
     */
    resetListQuoteCache();
    // 上游取不到价：不能记成 0，也不能拿请求体里的价顶上。
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));

    const response = await tradePost(
      orderRequest(
        { price: 1, shares: 100, side: "buy", symbol: "sh600519" },
        token,
      ),
    );

    expect(response.status).toBe(503);
    expect(listOrders(id)).toHaveLength(0);
  });
});
