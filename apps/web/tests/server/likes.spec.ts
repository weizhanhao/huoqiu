import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as likesRoute } from "../../src/app/api/social/likes/route";
import { issueSession } from "../../src/server/session";
import {
  countLikes,
  createPost,
  listLikedPostIds,
  listNotifications,
  registerAccount,
  setLike,
} from "../../src/server/social-store";

/*
 * 点赞。
 *
 * 点赞过去只活在客户端会话里：刷新即失，别人也看不到，于是通知里的
 * 「赞我的」永远是空的——不是没人赞，是赞根本没留下过。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-like-"));
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

const post = (accountId: string, title: string) => {
  const result = createPost({
    accountId,
    body: "先记录事实，再写判断。",
    now: NOW,
    title,
  });
  if ("error" in result) throw new Error(result.error);
  return result.post;
};

describe("likes that actually persist", () => {
  it("counts a like once no matter how many times it is sent", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    setLike({ accountId: lin.id, liked: true, now: NOW, postId: written.id });
    setLike({ accountId: lin.id, liked: true, now: NOW, postId: written.id });

    // 重复提交不该把同一个人算两次，否则赞数随手一刷就能刷上去。
    expect(countLikes(written.id)).toBe(1);
    expect(listLikedPostIds(lin.id)).toEqual([written.id]);
  });

  it("removes the like when it is taken back", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    setLike({ accountId: lin.id, liked: true, now: NOW, postId: written.id });
    setLike({ accountId: lin.id, liked: false, now: NOW, postId: written.id });

    expect(countLikes(written.id)).toBe(0);
    expect(listLikedPostIds(lin.id)).toEqual([]);
  });

  it("turns a real like into a real notification for the author", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    setLike({ accountId: lin.id, liked: true, now: NOW, postId: written.id });
    const found = listNotifications(zhang.id).find(
      ({ kind }) => kind === "like",
    );

    /*
     * 「赞我的」这一类此前恒为空。它空不是因为没人赞，而是因为赞没落盘——
     * 这条断言把两件事连起来：赞留下了，被赞的人就该收到通知。
     */
    expect(found?.category).toBe("likes");
    expect(found?.actorName).toBe("林曦");
    expect(found?.href).toBe(`/community/posts/${written.id}`);
  });

  it("does not notify you about liking your own post", () => {
    const zhang = account("zhang@example.com", "张远");
    const written = post(zhang.id, "我的第一条记录");

    setLike({ accountId: zhang.id, liked: true, now: NOW, postId: written.id });

    expect(listNotifications(zhang.id)).toHaveLength(0);
  });

  it("refuses to like a post that does not exist", () => {
    const lin = account("lin@example.com", "林曦");

    const result = setLike({
      accountId: lin.id,
      liked: true,
      now: NOW,
      postId: "post_0000000000000000",
    });

    // 放行会造出一条指向虚无的赞，赞数却真的涨了。
    expect(result).toEqual({ error: "帖子不存在。" });
  });

  it("refuses to like as somebody else", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    const response = await likesRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: lin.id,
          liked: true,
          post: written.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    /*
     * 请求体里写别人的 id 不该有任何效果。否则「谁赞了我」这条通知随便谁
     * 都能伪造，被赞的人还会以为真有人读过。
     */
    expect(response.status).toBe(401);
    expect(countLikes(written.id)).toBe(0);
  });

  it("records the like under the token holder", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");
    const token = issueSession(lin.id, Date.now() / 1000) ?? "";

    const response = await likesRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: zhang.id,
          liked: true,
          post: written.id,
        }),
        headers: {
          "content-type": "application/json",
          "x-huoqiu-session": token,
        },
        method: "POST",
      }),
    );
    const data = (await response.json()) as { likeCount: number };

    // 持票人是林曦，请求体却声称是张远：必须按令牌算。
    expect(data.likeCount).toBe(1);
    expect(listLikedPostIds(lin.id)).toEqual([written.id]);
    expect(listLikedPostIds(zhang.id)).toEqual([]);
  });
});
