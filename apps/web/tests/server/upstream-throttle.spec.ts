import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetAllAttempts } from "../../src/server/rate-limit";
import {
  UPSTREAM_LIMIT,
  UPSTREAM_WINDOW_MS,
  clientKeyOf,
  throttleUpstream,
} from "../../src/server/upstream-throttle";

/*
 * 外呼节流。
 *
 * 行情、基金、私募、视频这些接口每被调用一次，服务端就会向站外发一次请求。
 * 它们按设计不鉴权（公开数据，加登录挡不住任何人），于是也就没有任何门槛：
 * 谁都可以拿本站当一个匿名代理，对着上游一直打。
 *
 * 后果不是假设的。我在做行情的时候就撞见过：push2 被打多了之后，不返回
 * 错误码，而是回一个 HTTP 200 加空 body——站上表现为「行情取不到」，
 * 而且是整站所有人都取不到。把自己的出站量管住，是在保自己。
 */

const requestFrom = (ip: string | null): Request =>
  new Request("https://example.test/api/market/changes", {
    headers: ip === null ? {} : { "x-forwarded-for": ip },
  });

beforeEach(() => {
  resetAllAttempts();
});

afterEach(() => {
  resetAllAttempts();
});

describe("who a request is counted against", () => {
  it("uses the first address in the forwarded chain", () => {
    /*
     * x-forwarded-for 是「客户端, 代理1, 代理2」。取最后一个等于把所有人
     * 算到同一个代理头上——一个人打满，所有人一起被限。
     */
    expect(clientKeyOf(requestFrom("203.0.113.7, 10.0.0.1, 10.0.0.2"))).toBe(
      "203.0.113.7",
    );
    expect(clientKeyOf(requestFrom("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("still counts a request that carries no address", () => {
    /*
     * 拿不到来源不等于放行。本站预览网关就不加这个头——那种情况下
     * 全部归进同一个键，仍然有一个总闸，而不是彻底不限。
     */
    expect(clientKeyOf(requestFrom(null))).not.toBeNull();
    expect(clientKeyOf(requestFrom("   "))).toBe(
      clientKeyOf(requestFrom(null)),
    );
  });
});

describe("throttling the outbound calls", () => {
  it("lets a normal amount of browsing through", () => {
    const request = requestFrom("203.0.113.7");
    for (let index = 0; index < UPSTREAM_LIMIT; index++) {
      expect(
        throttleUpstream(request),
        `第 ${String(index + 1)} 次`,
      ).toBeNull();
    }
  });

  it("refuses once the window is full, and says when to come back", async () => {
    const request = requestFrom("203.0.113.7");
    for (let index = 0; index < UPSTREAM_LIMIT; index++) {
      throttleUpstream(request);
    }

    const refused = throttleUpstream(request);

    expect(refused?.status).toBe(429);
    // 不说什么时候能再来，客户端只能盲目重试，等于没限住。
    const retryAfter = Number(refused?.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(UPSTREAM_WINDOW_MS / 1000);
    // 错误信息里不能出现上游地址——那是在告诉别人该去打谁。
    const body = (await refused?.json()) as { error?: string };
    expect(body.error ?? "").not.toContain("eastmoney");
    expect(body.error ?? "").not.toContain("amac");
  });

  it("does not let one caller's flood lock everybody else out", () => {
    const flooder = requestFrom("198.51.100.9");
    for (let index = 0; index < UPSTREAM_LIMIT + 20; index++) {
      throttleUpstream(flooder);
    }

    // 计数是按来源分开的，隔壁的人照常能用。
    expect(throttleUpstream(requestFrom("203.0.113.7"))).toBeNull();
  });

  it("keeps separate counts per endpoint", () => {
    const ip = "203.0.113.7";
    for (let index = 0; index < UPSTREAM_LIMIT; index++) {
      throttleUpstream(requestFrom(ip), "changes");
    }

    /*
     * 一个页面会同时打好几个接口（行情页就有概览 + 异动）。所有接口共用一个
     * 计数的话，正常浏览几下就会把自己限住。
     */
    expect(throttleUpstream(requestFrom(ip), "videos")).toBeNull();
    expect(throttleUpstream(requestFrom(ip), "changes")?.status).toBe(429);
  });
});
