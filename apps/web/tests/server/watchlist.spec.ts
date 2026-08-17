import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as watchlistGet,
  POST as watchlistPost,
} from "../../src/app/api/social/watchlist/route";
import { issueSession } from "../../src/server/session";
import {
  listWatchlistSymbols,
  registerAccount,
  setWatchlisted,
} from "../../src/server/social-store";

/*
 * 自选。
 *
 * 自选此前只存在浏览器的 localStorage 里——换台设备就没了，手机上加的网页上
 * 看不到。搬到服务端之后，这些用例守的是它真的跟着账号走，且只跟着本人走。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-watchlist-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv(
    "HUOQIU_SESSION_SECRET",
    "session-secret-for-tests-0123456789abcdef",
  );
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const account = (email: string, displayName: string) => {
  const result = registerAccount({
    displayName,
    email,
    now: NOW,
    password: "Correct-Horse-9",
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

const request = (token: string | null, body?: unknown): Request =>
  new Request("http://127.0.0.1/api/social/watchlist", {
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), method: "POST" }),
    headers: token === null ? {} : { "x-huoqiu-session": token },
  });

const tokenFor = (accountId: string): string => {
  /*
   * 签发时间用当下，不用上面那个固定的 NOW。
   *
   * 令牌带有效期，而 currentAccountId 是拿真实时钟去验的——用 2026-08-13
   * 签一张票，跑用例时它可能已经过期，于是路由回 401，看起来像是鉴权写错了。
   */
  const issued = issueSession(accountId, Math.floor(Date.now() / 1000));
  if (issued === null) throw new Error("签发会话失败");
  return issued;
};

describe("watchlist storage", () => {
  it("keeps one entry no matter how many times the same symbol is added", () => {
    const owner = account("owner@example.com", "张远");

    setWatchlisted({
      accountId: owner.id,
      now: NOW,
      symbol: "sh600519",
      watchlisted: true,
    });
    const second = setWatchlisted({
      accountId: owner.id,
      now: NOW,
      symbol: "sh600519",
      watchlisted: true,
    });

    expect(second).toEqual({ symbols: ["sh600519"] });
  });

  it("orders symbols by when they were added, not by file position", () => {
    /*
     * 删掉中间一条再加回来，靠物理顺序会让它跑到末尾——用户看到的次序
     * 就和他添加的次序对不上了。
     */
    const owner = account("owner@example.com", "张远");
    const add = (symbol: string, at: string) =>
      setWatchlisted({
        accountId: owner.id,
        now: at,
        symbol,
        watchlisted: true,
      });

    add("sz000001", "2026-08-13T00:00:03.000Z");
    add("sh600519", "2026-08-13T00:00:01.000Z");
    add("sh601398", "2026-08-13T00:00:02.000Z");

    expect(listWatchlistSymbols(owner.id)).toEqual([
      "sh600519",
      "sh601398",
      "sz000001",
    ]);
  });

  it("keeps each account's list to itself", () => {
    const owner = account("owner@example.com", "张远");
    const other = account("other@example.com", "林曦");

    setWatchlisted({
      accountId: owner.id,
      now: NOW,
      symbol: "sh600519",
      watchlisted: true,
    });

    expect(listWatchlistSymbols(other.id)).toEqual([]);
  });

  it("removes a symbol when asked to", () => {
    const owner = account("owner@example.com", "张远");
    setWatchlisted({
      accountId: owner.id,
      now: NOW,
      symbol: "sh600519",
      watchlisted: true,
    });

    const removed = setWatchlisted({
      accountId: owner.id,
      now: NOW,
      symbol: "sh600519",
      watchlisted: false,
    });

    expect(removed).toEqual({ symbols: [] });
  });
});

describe("watchlist route", () => {
  it("refuses to read or write without a session", async () => {
    const read = watchlistGet(request(null));
    expect(read.status).toBe(401);

    const write = await watchlistPost(
      request(null, { symbol: "sh600519", watchlisted: true }),
    );
    expect(write.status).toBe(401);
  });

  it("stores a symbol against the token holder, not a body-supplied account", async () => {
    /*
     * 请求体里不接受 account 字段。接受的话，任何人抄一个公开的账号 id
     * 就能往别人的自选里塞东西——而那个 id 就印在个人主页地址里。
     */
    const owner = account("owner@example.com", "张远");
    const other = account("other@example.com", "林曦");

    const response = await watchlistPost(
      request(tokenFor(owner.id), {
        account: other.id,
        symbol: "sh600519",
        watchlisted: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(listWatchlistSymbols(owner.id)).toEqual(["sh600519"]);
    expect(listWatchlistSymbols(other.id)).toEqual([]);
  });

  it("rejects a symbol this site cannot open", async () => {
    /*
     * 加一个站内渲染不出来的代码，只会得到一行永远取不到价的空记录——
     * 用户会以为行情坏了。
     */
    const owner = account("owner@example.com", "张远");

    const response = await watchlistPost(
      request(tokenFor(owner.id), { symbol: "不是代码", watchlisted: true }),
    );

    expect(response.status).toBe(400);
    expect(listWatchlistSymbols(owner.id)).toEqual([]);
  });

  it("reads back what the same account wrote", async () => {
    const owner = account("owner@example.com", "张远");
    const token = tokenFor(owner.id);

    await watchlistPost(
      request(token, { symbol: "sh600519", watchlisted: true }),
    );
    const response = watchlistGet(request(token));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ symbols: ["sh600519"] });
  });
});
