import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as commentsGet,
  POST as commentsPost,
} from "../../src/app/api/social/comments/route";
import { issueSession } from "../../src/server/session";
import {
  countComments,
  createComment,
  createPost,
  listComments,
  listNotifications,
  registerAccount,
} from "../../src/server/social-store";

/*
 * 评论。
 *
 * 评论此前只活在客户端 reducer 里，id 形如 comment_session_1：刷新即失，
 * 别人看不到。上一轮修的是「署名不能是别人」，署名对了、内容仍然留不下来，
 * 于是「回复我的」这一类只能靠转发撑着。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-comment-"));
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

describe("comments that survive a refresh", () => {
  it("keeps a comment under its post", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    createComment({
      accountId: lin.id,
      body: "我更在意估值假设有没有随经营数据更新。",
      now: NOW,
      postId: written.id,
    });

    const listed = listComments(written.id);
    expect(listed).toHaveLength(1);
    // 署名要跟着带出来，否则详情页只能显示一个 id。
    expect(listed[0]?.authorName).toBe("林曦");
    expect(countComments(written.id)).toBe(1);
  });

  it("refuses an empty comment", () => {
    const zhang = account("zhang@example.com", "张远");
    const written = post(zhang.id, "我的第一条记录");

    expect(
      createComment({
        accountId: zhang.id,
        body: "   ",
        now: NOW,
        postId: written.id,
      }),
    ).toEqual({ error: "请输入评论内容后再发布。" });
  });

  it("refuses to comment on a post that does not exist", () => {
    const lin = account("lin@example.com", "林曦");

    expect(
      createComment({
        accountId: lin.id,
        body: "评论一条不存在的帖子。",
        now: NOW,
        postId: "post_0000000000000000",
      }),
    ).toEqual({ error: "帖子不存在。" });
  });

  it("refuses a reply whose parent belongs to another post", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const first = post(zhang.id, "第一条");
    const second = post(zhang.id, "第二条");

    const parent = createComment({
      accountId: lin.id,
      body: "挂在第一条下面。",
      now: NOW,
      postId: first.id,
    });
    if ("error" in parent) throw new Error(parent.error);

    /*
     * 允许跨帖挂回复，详情页就会渲染出一条没有上文的回复，看起来像数据
     * 错乱——而它其实是被正经写进去的。
     */
    expect(
      createComment({
        accountId: lin.id,
        body: "却挂到第二条下面。",
        now: NOW,
        parentId: parent.comment.id,
        postId: second.id,
      }),
    ).toEqual({ error: "被回复的评论不存在。" });
  });

  it("turns a real comment into a real notification for the author", () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    createComment({
      accountId: lin.id,
      body: "同意，先看数据验证。",
      now: NOW,
      postId: written.id,
    });
    const found = listNotifications(zhang.id).find(
      ({ kind }) => kind === "comment",
    );

    expect(found?.category).toBe("replies");
    expect(found?.actorName).toBe("林曦");
    expect(found?.href).toBe(`/community/posts/${written.id}`);
  });

  it("does not notify you about your own comment", () => {
    const zhang = account("zhang@example.com", "张远");
    const written = post(zhang.id, "我的第一条记录");

    createComment({
      accountId: zhang.id,
      body: "补一句自己的备注。",
      now: NOW,
      postId: written.id,
    });

    expect(listNotifications(zhang.id)).toHaveLength(0);
  });

  it("refuses to comment as somebody else", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");

    const response = await commentsPost(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: lin.id,
          body: "冒充林曦发的评论。",
          post: written.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(countComments(written.id)).toBe(0);
  });

  it("records the comment under the token holder", async () => {
    const zhang = account("zhang@example.com", "张远");
    const lin = account("lin@example.com", "林曦");
    const written = post(zhang.id, "我的第一条记录");
    const token = issueSession(lin.id, Date.now() / 1000) ?? "";

    const response = await commentsPost(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: zhang.id,
          body: "按令牌算，这条是林曦的。",
          post: written.id,
        }),
        headers: {
          "content-type": "application/json",
          "x-huoqiu-session": token,
        },
        method: "POST",
      }),
    );
    const data = (await response.json()) as { comment: { authorId: string } };

    expect(response.status).toBe(201);
    expect(data.comment.authorId).toBe(lin.id);
  });

  it("shows comments to signed-out visitors", async () => {
    const zhang = account("zhang@example.com", "张远");
    const written = post(zhang.id, "我的第一条记录");
    createComment({
      accountId: zhang.id,
      body: "公开可见的评论。",
      now: NOW,
      postId: written.id,
    });

    const response = await commentsGet(
      new Request(`https://example.test/api?post=${written.id}`),
    );
    const data = (await response.json()) as { comments: unknown[] };

    // 评论本来就是公开内容，未登录看不到会让帖子显得没人讨论过。
    expect(data.comments).toHaveLength(1);
  });
});
