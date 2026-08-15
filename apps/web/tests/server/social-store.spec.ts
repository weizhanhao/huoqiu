import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticate,
  createPost,
  getAccount,
  listPostsByAuthor,
  listPostsBySymbol,
  listThread,
  registerAccount,
  sendMessage,
  setFollow,
} from "../../src/server/social-store";

/*
 * 真实账号存储。
 *
 * 全站 398 条测试此前全部落在样本数据的界面上，而真正「真」的那一块——
 * 注册、scrypt 口令、发帖、关注、私信——一条覆盖都没有。它同时是最需要
 * 覆盖的：口令散列、越权发帖、邮箱唯一性都在这里，写错了不会有界面报错，
 * 只会安静地放行。
 *
 * 存储目录整体重定向到临时目录。真实库里有已注册的账号，测试绝不能碰它——
 * 一次误写就会把真实数据抹掉，而那正是本轮要保护的东西。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-social-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const register = (email: string, displayName: string) => {
  const result = registerAccount({
    displayName,
    email,
    now: NOW,
    password: "Correct-Horse-9",
  });
  if ("error" in result) {
    throw new Error(`注册失败：${result.error}`);
  }
  return result.account;
};

describe("real account store", () => {
  it("never hands out the password hash or salt", () => {
    const account = register("seed@example.com", "张远");

    /*
     * 公开账号对象会进 API 响应、进客户端会话、被序列化打日志。
     * 口令散列或盐一旦跟着漏出去，离线爆破就有了全部材料。
     */
    expect(Object.keys(account)).not.toContain("passwordHash");
    expect(Object.keys(account)).not.toContain("salt");
    expect(JSON.stringify(account)).not.toContain("Correct-Horse-9");
  });

  it("stores the password only as a salted hash on disk", () => {
    register("seed@example.com", "张远");

    const raw = readFileSync(resolve(directory, "social-v1.json"), "utf8");
    // 明文口令落盘是最坏的一种失败，且从界面上完全看不出来。
    expect(raw).not.toContain("Correct-Horse-9");
    const parsed = JSON.parse(raw) as {
      accounts: { passwordHash: string; salt: string }[];
    };
    expect(parsed.accounts[0]?.salt.length).toBeGreaterThan(0);
    expect(parsed.accounts[0]?.passwordHash.length).toBeGreaterThan(0);
  });

  it("gives two accounts with the same password different hashes", () => {
    register("first@example.com", "张远");
    register("second@example.com", "林曦");

    const parsed = JSON.parse(
      readFileSync(resolve(directory, "social-v1.json"), "utf8"),
    ) as { accounts: { passwordHash: string }[] };

    // 同口令散列相同即说明没加盐，一张彩虹表就能一次撞开所有账号。
    expect(parsed.accounts[0]?.passwordHash).not.toBe(
      parsed.accounts[1]?.passwordHash,
    );
  });

  it("rejects a duplicate email regardless of case or padding", () => {
    register("seed@example.com", "张远");

    const again = registerAccount({
      displayName: "冒名者",
      email: "  SEED@Example.COM  ",
      now: NOW,
      password: "Another-Pass-1",
    });

    // 不归一化就等于同一个邮箱能注册出多个账号，登录时谁先匹配上算谁的。
    expect(again).toEqual({ error: "该邮箱已注册。" });
  });

  it("accepts the right password and refuses the wrong one", () => {
    const account = register("seed@example.com", "张远");

    const ok = authenticate({
      email: "seed@example.com",
      password: "Correct-Horse-9",
    });
    const wrong = authenticate({
      email: "seed@example.com",
      password: "Correct-Horse-8",
    });

    expect("account" in ok && ok.account.id).toBe(account.id);
    expect("error" in wrong).toBe(true);
  });

  it("does not reveal whether an email is registered", () => {
    register("seed@example.com", "张远");

    const wrongPassword = authenticate({
      email: "seed@example.com",
      password: "Correct-Horse-8",
    });
    const unknownEmail = authenticate({
      email: "nobody@example.com",
      password: "Correct-Horse-9",
    });

    /*
     * 两种失败给不同话术，就等于把「这个邮箱注册过没有」做成了一个可枚举
     * 的接口。攻击者据此先筛出真实用户，再集中撞库。
     */
    expect(wrongPassword).toEqual(unknownEmail);
  });

  it("refuses to create a post for an account that does not exist", () => {
    const result = createPost({
      accountId: "acct_0000000000000000",
      body: "凭空冒出来的正文。",
      now: NOW,
      title: "不该存在的帖子",
    });

    // 放行就等于任何人都能凭一个编造的 id 往站上写东西，且没有作者可追。
    expect(result).toEqual({ error: "账号不存在，请先登录。" });
  });

  it("keeps a real post and lists it under its author", () => {
    const account = register("seed@example.com", "张远");
    const created = createPost({
      accountId: account.id,
      body: "先记录事实，再写判断。",
      now: NOW,
      title: "我的第一条记录",
    });

    expect("post" in created).toBe(true);
    const listed = listPostsByAuthor(account.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("我的第一条记录");
    // 计数必须来自真实帖子，而不是另存一个会和事实脱节的计数器。
    expect(getAccount(account.id)?.postCount).toBe(1);
  });

  it("refuses to quote a post that was never written", () => {
    const account = register("seed@example.com", "张远");

    const result = createPost({
      accountId: account.id,
      body: "转发一条不存在的帖子。",
      now: NOW,
      quotedPostId: "post_0000000000000000",
      title: "转发",
    });

    expect(result).toEqual({ error: "被转发的帖子不存在。" });
  });

  it("refuses self-follow and counts real followers", () => {
    const zhang = register("first@example.com", "张远");
    const lin = register("second@example.com", "林曦");

    expect(
      setFollow({
        followeeId: zhang.id,
        followerId: zhang.id,
        following: true,
        now: NOW,
      }),
    ).toEqual({ error: "不能关注自己。" });

    const followed = setFollow({
      followeeId: zhang.id,
      followerId: lin.id,
      following: true,
      now: NOW,
    });

    expect(followed).toEqual({ followerCount: 1 });
    expect(getAccount(zhang.id)?.followerCount).toBe(1);
    expect(getAccount(lin.id)?.followingCount).toBe(1);
  });

  it("delivers a direct message to both sides of the thread", () => {
    const zhang = register("first@example.com", "张远");
    const lin = register("second@example.com", "林曦");

    sendMessage({
      body: "看到你那条记录了。",
      fromId: lin.id,
      now: NOW,
      toId: zhang.id,
    });

    /*
     * 两个方向读到的是同一条会话。只按 fromId 过滤的实现会让收件人看不见
     * 自己发出的那半边，聊天记录看上去像单方面自言自语。
     */
    expect(listThread(zhang.id, lin.id)).toHaveLength(1);
    expect(listThread(lin.id, zhang.id)).toHaveLength(1);
  });

  it("refuses an empty message and a message to oneself", () => {
    const zhang = register("first@example.com", "张远");
    const lin = register("second@example.com", "林曦");

    expect(
      sendMessage({ body: "   ", fromId: lin.id, now: NOW, toId: zhang.id }),
    ).toEqual({ error: "私信内容不能为空。" });
    expect(
      sendMessage({ body: "自言自语", fromId: lin.id, now: NOW, toId: lin.id }),
    ).toEqual({ error: "不能给自己发私信。" });
  });
});

/*
 * 个股讨论。
 *
 * 标的页的讨论区此前只有一个发帖框，从不把这只标的下的帖子读回来——
 * 发出去的话在这一页上再也看不到。用户发完只能自己去主页找，
 * 而讨论区之所以叫讨论区，是因为能看见别人说了什么。
 *
 * 帖子靠正文里的 $代码$ 标记归属到标的，这是发帖框写进去的形式。
 */
describe("posts that belong to one instrument", () => {
  it("finds the ones tagged with that symbol, newest first", () => {
    const zhang = register("sym-a@example.com", "张远");

    for (const [body, now] of [
      ["$sh600519$ 先说的", "2026-08-13T01:00:00.000Z"],
      ["$sz300750$ 说的是另一只", "2026-08-13T02:00:00.000Z"],
      ["$sh600519$ 后说的", "2026-08-13T03:00:00.000Z"],
      ["没有标记，只是路过", "2026-08-13T04:00:00.000Z"],
    ] as const) {
      const result = createPost({
        accountId: zhang.id,
        body,
        now,
        title: "讨论",
      });
      if ("error" in result) throw new Error(result.error);
    }

    const found = listPostsBySymbol("sh600519");

    expect(found.map((post) => post.body)).toEqual([
      "$sh600519$ 后说的",
      "$sh600519$ 先说的",
    ]);
    // 讨论区要显示作者名，不能只有一个 acct_ 开头的 id。
    expect(found[0]?.authorName).toBe("张远");
  });

  it("does not mistake a longer code for this one", () => {
    const zhang = register("sym-b@example.com", "张远");
    for (const body of [
      "$sh6005$ 短的",
      "$sh600519x$ 长的",
      "sh600519 没有美元号",
    ]) {
      const result = createPost({
        accountId: zhang.id,
        body,
        now: NOW,
        title: "讨论",
      });
      if ("error" in result) throw new Error(result.error);
    }

    /*
     * 标记必须是完整的 $代码$。按子串匹配的话，$sh6005$ 会把 sh600519 的
     * 讨论也吸过来——两只完全不同的标的，讨论混在一起而界面上看不出来。
     */
    expect(listPostsBySymbol("sh600519")).toHaveLength(0);
  });

  it("reads the tag regardless of letter case", () => {
    const zhang = register("sym-c@example.com", "张远");
    const result = createPost({
      accountId: zhang.id,
      body: "$SH600519$ 大写也是同一只",
      now: NOW,
      title: "讨论",
    });
    if ("error" in result) throw new Error(result.error);

    // 代码本身不分大小写，讨论不该因为用户按了 Shift 就分成两拨。
    expect(listPostsBySymbol("sh600519")).toHaveLength(1);
  });
});
