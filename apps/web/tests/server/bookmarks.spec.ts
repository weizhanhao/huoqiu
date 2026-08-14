import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as bookmarksRoute } from "../../src/app/api/social/bookmarks/route";
import { loadProfile } from "../../src/features/account/profile-lookup.server";
import { issueSession } from "../../src/server/session";
import {
  createComment,
  createPost,
  listBookmarkedPostIds,
  listBookmarkedPosts,
  listCommentsByAuthor,
  registerAccount,
  setBookmark,
} from "../../src/server/social-store";

/*
 * 收藏与回复。
 *
 * 个人主页有这两个页签，此前背后没有任何数据支撑——页签在那儿，点开永远
 * 是空的。这里同时守两头：数据存得住，以及主页真的把它读出来。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-bookmark-"));
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

describe("bookmarks", () => {
  it("counts a bookmark once no matter how many times it is sent", () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");

    setBookmark({
      accountId: reader.id,
      bookmarked: true,
      now: NOW,
      postId: written.id,
    });
    setBookmark({
      accountId: reader.id,
      bookmarked: true,
      now: NOW,
      postId: written.id,
    });

    expect(listBookmarkedPostIds(reader.id)).toEqual([written.id]);
  });

  it("removes the bookmark when it is taken back", () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");

    setBookmark({
      accountId: reader.id,
      bookmarked: true,
      now: NOW,
      postId: written.id,
    });
    setBookmark({
      accountId: reader.id,
      bookmarked: false,
      now: NOW,
      postId: written.id,
    });

    expect(listBookmarkedPosts(reader.id)).toEqual([]);
  });

  it("refuses to bookmark a post that does not exist", () => {
    const reader = account("reader@example.com", "林曦");

    expect(
      setBookmark({
        accountId: reader.id,
        bookmarked: true,
        now: NOW,
        postId: "post_0000000000000000",
      }),
    ).toEqual({ error: "帖子不存在。" });
  });

  it("shows the bookmarked post on the reader's profile", () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");

    setBookmark({
      accountId: reader.id,
      bookmarked: true,
      now: NOW,
      postId: written.id,
    });

    /*
     * 存住只是一半：主页那一页要真的读出来。
     * 「收藏」页签空着不是因为没人收藏，此前是因为根本没有收藏这回事。
     */
    const profile = loadProfile(reader.id);
    expect(profile?.bookmarks).toHaveLength(1);
    expect(profile?.bookmarks[0]?.title).toBe("我的第一条记录");
    // 收藏的是别人的帖子，署名要显示原作者而不是收藏者。
    expect(profile?.bookmarks[0]?.publishedLabel).toContain("张远");
  });

  it("refuses to bookmark on somebody else's behalf", async () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");

    const response = await bookmarksRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: reader.id,
          bookmarked: true,
          post: written.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(listBookmarkedPostIds(reader.id)).toEqual([]);
  });

  it("records the bookmark under the token holder", async () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");
    const token = issueSession(reader.id, Date.now() / 1000, 0) ?? "";

    await bookmarksRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: author.id,
          bookmarked: true,
          post: written.id,
        }),
        headers: {
          "content-type": "application/json",
          "x-huoqiu-session": token,
        },
        method: "POST",
      }),
    );

    // 持票人是林曦，请求体却声称是张远：必须按令牌算。
    expect(listBookmarkedPostIds(reader.id)).toEqual([written.id]);
    expect(listBookmarkedPostIds(author.id)).toEqual([]);
  });
});

describe("replies on a profile", () => {
  it("lists the comments an account wrote, newest first", () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");

    createComment({
      accountId: reader.id,
      body: "先看数据验证。",
      now: "2026-08-11T00:00:00.000Z",
      postId: written.id,
    });
    createComment({
      accountId: reader.id,
      body: "再补一组反例。",
      now: "2026-08-12T00:00:00.000Z",
      postId: written.id,
    });

    const listed = listCommentsByAuthor(reader.id);
    expect(listed.map(({ body }) => body)).toEqual([
      "再补一组反例。",
      "先看数据验证。",
    ]);
    // 带上原帖标题：只放一句评论，读者不知道它在回应什么。
    expect(listed[0]?.postTitle).toBe("我的第一条记录");
  });

  it("shows those replies on the profile page", () => {
    const author = account("author@example.com", "张远");
    const reader = account("reader@example.com", "林曦");
    const written = post(author.id, "我的第一条记录");
    createComment({
      accountId: reader.id,
      body: "先看数据验证。",
      now: NOW,
      postId: written.id,
    });

    const profile = loadProfile(reader.id);
    expect(profile?.replies).toHaveLength(1);
    // 回复要能点回原帖。
    expect(profile?.replies[0]?.href).toBe(`/community/posts/${written.id}`);
  });

  it("leaves column accounts with no replies or bookmarks", () => {
    /*
     * 栏目账号没有这两类行为，如实给空。拿它的栏目文章去填「收藏」页签，
     * 会让人以为那是它收藏的别人的内容。
     */
    const profile = loadProfile("author_syn_editorial");

    expect(profile?.replies).toEqual([]);
    expect(profile?.bookmarks).toEqual([]);
  });
});
