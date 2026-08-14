import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as notificationsRoute } from "../../src/app/api/social/notifications/route";
import { issueSession } from "../../src/server/session";
import {
  createPost,
  listNotifications,
  registerAccount,
  setFollow,
} from "../../src/server/social-store";

/*
 * 真实通知。
 *
 * 通知页此前整页都是虚构角色的固定样本：真实账号被真人关注了，通知里什么
 * 都没有，却挂着「北岸观察员回复了你的讨论」。事件早就落在库里，只是没人读。
 */
const NOW = "2026-08-13T00:00:00.000Z";
const SECRET = "session-secret-for-tests-0123456789abcdef";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-notif-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
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

const post = (accountId: string, title: string, quotedPostId?: string) => {
  const result = createPost({
    accountId,
    body: "先记录事实，再写判断。",
    now: NOW,
    title,
    ...(quotedPostId === undefined ? {} : { quotedPostId }),
  });
  if ("error" in result) throw new Error(result.error);
  return result.post;
};

describe("notifications derived from real events", () => {
  it("tells you who followed you", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    setFollow({
      followeeId: zhang.id,
      followerId: lin.id,
      following: true,
      now: NOW,
    });

    const [first] = listNotifications(zhang.id);

    expect(first?.category).toBe("follows");
    expect(first?.actorName).toBe("林曦");
    // 落点必须是关注者本人的主页，否则这条通知点开没有下文。
    expect(first?.href).toBe(`/users/${lin.id}`);
  });

  it("tells you who quoted your post", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const original = post(zhang.id, "我的第一条记录");
    const quote = post(lin.id, "转发：我的第一条记录", original.id);

    const found = listNotifications(zhang.id).find(
      ({ kind }) => kind === "quote",
    );

    expect(found?.actorName).toBe("林曦");
    expect(found?.href).toBe(`/community/posts/${quote.id}`);
  });

  it("does not notify you about your own actions", () => {
    const zhang = account("zhang@example.com", "张远");
    const original = post(zhang.id, "我的第一条记录");
    post(zhang.id, "自己转发自己", original.id);

    /*
     * 自己转发自己不该产生通知：通知是「别人对我做了什么」，
     * 把自己的动作报回来只会让未读数虚高。
     */
    expect(listNotifications(zhang.id)).toHaveLength(0);
  });

  it("invents nothing when nothing has happened", () => {
    const zhang = account("zhang@example.com", "张远");

    // 没有真实事件就是空的。宁可空着，也不拿样本条目冒充成真事。
    expect(listNotifications(zhang.id)).toEqual([]);
  });

  it("keeps one account's notifications out of another's", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const mystery = account("third@example.com", "陈默");
    setFollow({
      followeeId: zhang.id,
      followerId: lin.id,
      following: true,
      now: NOW,
    });

    const token = issueSession(mystery.id, Date.now() / 1000) ?? "";
    const response = await notificationsRoute(
      new Request("https://example.test/api", {
        headers: { "x-huoqiu-session": token },
      }),
    );
    const data = (await response.json()) as { notifications: unknown[] };

    /*
     * 通知里含「谁关注了我」这类关系信息。按令牌取，第三方拿自己的票
     * 读不到别人的事件。
     */
    expect(data.notifications).toEqual([]);
  });

  it("returns nothing at all without a session", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    setFollow({
      followeeId: zhang.id,
      followerId: lin.id,
      following: true,
      now: NOW,
    });

    const response = await notificationsRoute(
      new Request(`https://example.test/api?account=${zhang.id}`),
    );
    const data = (await response.json()) as { notifications: unknown[] };

    // 查询串里写别人的 id 不该有任何效果——这条端点从来不看它。
    expect(data.notifications).toEqual([]);
  });
});
