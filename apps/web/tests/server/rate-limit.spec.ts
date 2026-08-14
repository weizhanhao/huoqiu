import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as loginRoute } from "../../src/app/api/social/login/route";
import {
  clearAttempts,
  consumeAttempt,
  resetAllAttempts,
} from "../../src/server/rate-limit";
import { registerAccount } from "../../src/server/social-store";

/*
 * 尝试次数限制。
 *
 * 补上会话令牌之后，剩下的入口就是对着某个账号一直猜口令。scrypt 让每次
 * 猜测很贵，但「贵」不等于「有限」——不限次数就只是慢，最终还是能撞开。
 */
const WINDOW = 60_000;

let directory = "";

beforeEach(() => {
  resetAllAttempts();
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-rate-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv(
    "HUOQIU_SESSION_SECRET",
    "session-secret-for-tests-0123456789abcdef",
  );
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  resetAllAttempts();
});

describe("attempt limiting", () => {
  it("allows up to the limit and refuses the next one", () => {
    const options = { limit: 3, now: 1_000, windowMs: WINDOW };

    for (let index = 0; index < 3; index += 1) {
      expect(consumeAttempt("k", options).allowed).toBe(true);
    }
    expect(consumeAttempt("k", options).allowed).toBe(false);
  });

  it("tells the caller how long to wait", () => {
    const options = { limit: 1, now: 1_000, windowMs: WINDOW };
    consumeAttempt("k", options);

    const blocked = consumeAttempt("k", { ...options, now: 21_000 });

    // 只说等多久，不说还剩几次——后者等于把剩余额度也告诉攻击者。
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(40);
  });

  it("lets the window slide instead of locking out forever", () => {
    const options = { limit: 2, now: 0, windowMs: WINDOW };
    consumeAttempt("k", options);
    consumeAttempt("k", options);

    expect(consumeAttempt("k", { ...options, now: 30_000 }).allowed).toBe(
      false,
    );
    // 窗口整体滑过去之后必须重新放行，否则一次触发就是永久封禁。
    expect(consumeAttempt("k", { ...options, now: 61_000 }).allowed).toBe(true);
  });

  it("does not extend the block when the caller keeps hammering", () => {
    const options = { limit: 1, now: 0, windowMs: WINDOW };
    consumeAttempt("k", options);

    // 被挡下的尝试不该被计入，否则持续重试会让窗口永远滑不出去。
    for (const now of [10_000, 20_000, 30_000, 40_000, 50_000]) {
      consumeAttempt("k", { ...options, now });
    }
    expect(consumeAttempt("k", { ...options, now: 61_000 }).allowed).toBe(true);
  });

  it("keeps separate counters per key", () => {
    const options = { limit: 1, now: 0, windowMs: WINDOW };
    consumeAttempt("first", options);

    // 一个账号被打不该连累别人，否则限流本身成了拒绝服务的工具。
    expect(consumeAttempt("second", options).allowed).toBe(true);
  });

  it("forgets a key once it is cleared", () => {
    const options = { limit: 1, now: 0, windowMs: WINDOW };
    consumeAttempt("k", options);
    clearAttempts("k");

    expect(consumeAttempt("k", options).allowed).toBe(true);
  });
});

describe("login endpoint", () => {
  const login = (email: string, password: string): Promise<Response> =>
    loginRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

  it("stops an unbounded password guessing run", async () => {
    registerAccount({
      displayName: "张远",
      email: "victim@example.com",
      now: "2026-08-13T00:00:00.000Z",
      password: "Correct-Horse-9",
    });

    const codes: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await login("victim@example.com", `wrong-${attempt}`);
      codes.push(response.status);
    }

    /*
     * 前若干次是正常的认证失败（401），之后必须转成 429。
     * 全 401 就说明猜测次数没有上限——慢，但没有尽头。
     */
    expect(codes.filter((code) => code === 401).length).toBeGreaterThan(0);
    expect(codes.at(-1)).toBe(429);
  });

  it("still lets the real owner in after a few typos", async () => {
    registerAccount({
      displayName: "张远",
      email: "owner@example.com",
      now: "2026-08-13T00:00:00.000Z",
      password: "Correct-Horse-9",
    });

    await login("owner@example.com", "typo-1");
    await login("owner@example.com", "typo-2");
    const response = await login("owner@example.com", "Correct-Horse-9");
    const data = (await response.json()) as { token?: string };

    // 限流不能把正常用户挡在外面，否则修一个洞换来一个更常见的故障。
    expect(response.status).toBe(200);
    expect(typeof data.token).toBe("string");
  });
});
