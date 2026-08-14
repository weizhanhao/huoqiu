import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as blocksGet } from "../../src/app/api/social/blocks/route";
import { issueSession } from "../../src/server/session";
import {
  createComment,
  createPost,
  isBlocked,
  listBlocked,
  registerAccount,
  sendMessage,
  setBlock,
  setFollow,
} from "../../src/server/social-store";

/*
 * 屏蔽。
 *
 * 设置页上写着「已屏蔽用户不能对你进行关注、评论、私信等操作」。
 * 屏蔽此前只存在浏览器 localStorage 里：换台设备就没了，服务端一无所知，
 * 那三个接口照样放行——那句话是假的，它只把对方的内容从我这边藏起来。
 *
 * 所以这里逐条验证那句承诺：关注、评论、私信，一个都不能漏。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-block-"));
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

/** 张远屏蔽林曦；返回这两个人。 */
const blockedPair = () => {
  const owner = account("owner@example.com", "张远");
  const other = account("other@example.com", "林曦");
  setBlock({ blocked: true, blockedId: other.id, now: NOW, ownerId: owner.id });
  return { other, owner };
};

describe("blocking that the settings page can honestly promise", () => {
  it("keeps the block after the browser is gone", () => {
    const { other, owner } = blockedPair();

    // 落盘之前这份名单只在 localStorage 里，换台设备就没了。
    expect(isBlocked(owner.id, other.id)).toBe(true);
    expect(listBlocked(owner.id).map(({ blockedId }) => blockedId)).toEqual([
      other.id,
    ]);
  });

  it("stays one-directional", () => {
    const { other, owner } = blockedPair();

    // 我拉黑你，不等于你拉黑我——反向该照常。
    expect(isBlocked(other.id, owner.id)).toBe(false);
  });

  it("refuses a follow from a blocked account", () => {
    const { other, owner } = blockedPair();

    expect(
      setFollow({
        followeeId: owner.id,
        followerId: other.id,
        following: true,
        now: NOW,
      }),
    ).toEqual({ error: "你无法关注该用户。" });
  });

  it("still lets a blocked account unfollow", () => {
    const owner = account("owner@example.com", "张远");
    const other = account("other@example.com", "林曦");
    setFollow({
      followeeId: owner.id,
      followerId: other.id,
      following: true,
      now: NOW,
    });
    setBlock({
      blocked: true,
      blockedId: other.id,
      now: NOW,
      ownerId: owner.id,
    });

    /*
     * 只挡新增，不挡取消。两头都挡就等于把人锁在一段他自己无法解除的关系
     * 里——被屏蔽了还得继续关注着对方。
     */
    expect(
      setFollow({
        followeeId: owner.id,
        followerId: other.id,
        following: false,
        now: NOW,
      }),
    ).toEqual({ followerCount: 0 });
  });

  it("refuses a comment from a blocked account", () => {
    const { other, owner } = blockedPair();
    const written = createPost({
      accountId: owner.id,
      body: "先记录事实。",
      now: NOW,
      title: "我的第一条记录",
    });
    if ("error" in written) throw new Error(written.error);

    expect(
      createComment({
        accountId: other.id,
        body: "被屏蔽了还想留言。",
        now: NOW,
        postId: written.post.id,
      }),
    ).toEqual({ error: "你无法在该用户的内容下发表评论。" });
  });

  it("refuses a direct message from a blocked account", () => {
    const { other, owner } = blockedPair();

    expect(
      sendMessage({
        body: "被屏蔽了还想私信。",
        fromId: other.id,
        now: NOW,
        toId: owner.id,
      }),
    ).toEqual({ error: "你无法给该用户发送私信。" });
  });

  it("lets the owner take the block back", () => {
    const { other, owner } = blockedPair();
    setBlock({
      blocked: false,
      blockedId: other.id,
      now: NOW,
      ownerId: owner.id,
    });

    expect(isBlocked(owner.id, other.id)).toBe(false);
    expect(
      sendMessage({
        body: "解除之后就发得出去了。",
        fromId: other.id,
        now: NOW,
        toId: owner.id,
      }),
    ).toHaveProperty("message");
  });

  it("refuses to block yourself", () => {
    const owner = account("owner@example.com", "张远");

    expect(
      setBlock({
        blocked: true,
        blockedId: owner.id,
        now: NOW,
        ownerId: owner.id,
      }),
    ).toEqual({ error: "不能屏蔽自己。" });
  });

  it("never hands one account's block list to another", async () => {
    const { owner } = blockedPair();
    const stranger = account("third@example.com", "陈默");
    const token = issueSession(stranger.id, Date.now() / 1000) ?? "";

    const response = await blocksGet(
      new Request(`https://example.test/api?account=${owner.id}`, {
        headers: { "x-huoqiu-session": token },
      }),
    );
    const data = (await response.json()) as { blocked: unknown[] };

    /*
     * 屏蔽名单是「我不想再看到谁」，本身就是私密信息。
     * 查询串里写别人的 id 不该有任何效果。
     */
    expect(data.blocked).toEqual([]);
  });
});
