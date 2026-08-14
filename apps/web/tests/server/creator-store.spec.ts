import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countPostView,
  createPost,
  listAuthorPosts,
  listPosts,
  publishDraft,
  readAuthorStats,
  readPostViews,
  registerAccount,
  saveDraft,
} from "../../src/server/social-store";

/*
 * 创作者中心的存储层：草稿、长文、浏览计数。
 *
 * 站内此前只有「发一条就直接公开」这一条路：Post 没有状态、没有长文与讨论
 * 之分，也没有任何浏览记录。创作者中心的草稿箱、内容管理、数据中心全都
 * 落在这三样上。
 *
 * 三件事错了不会报错：
 *   1. 草稿混进公开列表——用户以为存着，其实已经发出去了；
 *   2. 旧记录没有新字段，读取端不给默认值就会整片消失；
 *   3. 浏览量不按天分桶，「昨天阅读量」就永远只能显示累计值。
 */

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-creator-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const makeAccount = (): string => {
  const account = registerAccount({
    displayName: "张远",
    email: "creator@example.com",
    now: "2026-08-14T00:00:00.000Z",
    password: "Correct-Horse-9",
  });
  if ("error" in account) throw new Error(account.error);
  return account.account.id;
};

describe("drafts", () => {
  it("keeps a draft out of the public feed", () => {
    /*
     * 草稿混进公开列表，是这一层最不能出的错：用户以为存着，其实已经
     * 发出去了。而列表上它和已发布的帖子长得一模一样。
     */
    const accountId = makeAccount();

    const draft = saveDraft({
      accountId,
      body: "还没想好怎么写",
      kind: "article",
      now: "2026-08-14T01:00:00.000Z",
      title: "草稿标题",
    });
    if ("error" in draft) throw new Error(draft.error);

    expect(listPosts().some((post) => post.id === draft.post.id)).toBe(false);
    // 但作者自己要看得见。
    expect(
      listAuthorPosts(accountId).some((post) => post.id === draft.post.id),
    ).toBe(true);
  });

  it("publishes a draft without creating a second copy", () => {
    /*
     * 发布是把这一条的状态改掉，不是新建一条。新建的话草稿箱里会留下
     * 一份孤儿，而用户以为自己只发了一次。
     */
    const accountId = makeAccount();
    const draft = saveDraft({
      accountId,
      body: "正文",
      kind: "article",
      now: "2026-08-14T01:00:00.000Z",
      title: "标题",
    });
    if ("error" in draft) throw new Error(draft.error);

    const published = publishDraft({
      accountId,
      now: "2026-08-14T02:00:00.000Z",
      postId: draft.post.id,
    });
    if ("error" in published) throw new Error(published.error);

    expect(published.post.id).toBe(draft.post.id);
    expect(listAuthorPosts(accountId)).toHaveLength(1);
    expect(listPosts().some((post) => post.id === draft.post.id)).toBe(true);
  });

  it("refuses to publish someone else's draft", () => {
    const owner = makeAccount();
    const draft = saveDraft({
      accountId: owner,
      body: "正文",
      kind: "article",
      now: "2026-08-14T01:00:00.000Z",
      title: "标题",
    });
    if ("error" in draft) throw new Error(draft.error);

    const stranger = registerAccount({
      displayName: "李四",
      email: "other@example.com",
      now: "2026-08-14T00:00:00.000Z",
      password: "Correct-Horse-9",
    });
    if ("error" in stranger) throw new Error(stranger.error);

    const attempt = publishDraft({
      accountId: stranger.account.id,
      now: "2026-08-14T02:00:00.000Z",
      postId: draft.post.id,
    });

    expect(attempt).toHaveProperty("error");
    // 而且原稿不能被改动。
    expect(listPosts().some((post) => post.id === draft.post.id)).toBe(false);
  });

  it("stamps kind and status onto a newly created post", () => {
    // 新记录明确写上，不依赖读取端兜底——兜底是给存量数据的。
    const accountId = makeAccount();
    const fresh = createPost({
      accountId,
      body: "新帖子",
      now: "2026-08-14T01:00:00.000Z",
      title: "新标题",
    });
    if ("error" in fresh) throw new Error(fresh.error);

    expect(fresh.post.kind).toBe("discussion");
    expect(fresh.post.status).toBe("published");
  });

  it("treats a legacy record with no status as published", () => {
    /*
     * 存量帖子里没有 status 与 kind 这两个字段。读取端不兜默认值，
     * 它们会被当成草稿——整个社区的内容一夜之间从公开列表上消失，
     * 而数据其实完好无损。
     *
     * 必须直接往库文件里写一条没有这两个字段的记录。用 createPost 造
     * 是测不到的：它现在会显式写上，走的是新写入路径，兜底逻辑一次都
     * 碰不到——我第一版就是这么写的，用例全绿，兜底删掉也照样绿。
     */
    const accountId = makeAccount();
    const path = resolve(directory, "social-v1.json");
    const store = JSON.parse(readFileSync(path, "utf8")) as {
      posts: unknown[];
    };
    store.posts.unshift({
      authorId: accountId,
      body: "老帖子",
      createdAt: "2026-08-13T01:00:00.000Z",
      id: "post_legacy00000000",
      title: "老标题",
    });
    writeFileSync(path, JSON.stringify(store), "utf8");

    expect(listPosts().some((post) => post.id === "post_legacy00000000")).toBe(
      true,
    );
    expect(
      listAuthorPosts(accountId).find(
        (post) => post.id === "post_legacy00000000",
      )?.kind,
    ).toBe("discussion");
  });
});

describe("view counting", () => {
  it("counts a view per day so the daily figure means something", () => {
    /*
     * 数据中心显示的是「昨天阅读量」，所以计数必须按天分桶。只记总数的话
     * 那个「昨天」永远只能显示累计值——数字在涨，含义是错的。
     */
    const accountId = makeAccount();
    const post = createPost({
      accountId,
      body: "正文",
      now: "2026-08-13T01:00:00.000Z",
      title: "标题",
    });
    if ("error" in post) throw new Error(post.error);

    countPostView({ now: "2026-08-13T02:00:00.000Z", postId: post.post.id });
    countPostView({ now: "2026-08-13T03:00:00.000Z", postId: post.post.id });
    countPostView({ now: "2026-08-14T01:00:00.000Z", postId: post.post.id });

    const stats = readAuthorStats(accountId);
    expect(stats.viewsByDate["2026-08-13"]).toBe(2);
    expect(stats.viewsByDate["2026-08-14"]).toBe(1);
    expect(stats.totalViews).toBe(3);
  });

  it("reports one post's views without mixing in the author's other posts", () => {
    /*
     * 帖子页显示的是这一篇的阅读量。按作者汇总的那个数拿来当篇阅读量，
     * 每一篇底下都会显示同一个总数——发得越多，每篇看着越热门。
     */
    const accountId = makeAccount();
    const one = createPost({
      accountId,
      body: "甲",
      now: "2026-08-13T01:00:00.000Z",
      title: "甲",
    });
    const two = createPost({
      accountId,
      body: "乙",
      now: "2026-08-13T01:00:00.000Z",
      title: "乙",
    });
    if ("error" in one) throw new Error(one.error);
    if ("error" in two) throw new Error(two.error);

    countPostView({ now: "2026-08-13T02:00:00.000Z", postId: one.post.id });
    // 跨天：一篇的阅读量要把各天加起来，不是只报最近那天。
    countPostView({ now: "2026-08-14T02:00:00.000Z", postId: one.post.id });
    countPostView({ now: "2026-08-14T03:00:00.000Z", postId: two.post.id });

    expect(readPostViews(one.post.id)).toBe(2);
    expect(readPostViews(two.post.id)).toBe(1);
    // 没人看过的帖子是 0，不是报错。
    expect(readPostViews("post_ffffffffffffffff")).toBe(0);
  });

  it("does not count views for a post that does not exist", () => {
    // 不存在的 id 也照记的话，数据中心会凭空多出阅读量。
    countPostView({ now: "2026-08-14T01:00:00.000Z", postId: "post_ffffffff" });

    const accountId = makeAccount();
    expect(readAuthorStats(accountId).totalViews).toBe(0);
  });

  it("keeps each author's numbers to their own posts", () => {
    const mine = makeAccount();
    const theirs = registerAccount({
      displayName: "李四",
      email: "other@example.com",
      now: "2026-08-14T00:00:00.000Z",
      password: "Correct-Horse-9",
    });
    if ("error" in theirs) throw new Error(theirs.error);

    const hisPost = createPost({
      accountId: theirs.account.id,
      body: "别人的",
      now: "2026-08-14T01:00:00.000Z",
      title: "别人的标题",
    });
    if ("error" in hisPost) throw new Error(hisPost.error);
    countPostView({ now: "2026-08-14T02:00:00.000Z", postId: hisPost.post.id });

    /* 别人的阅读量算到我头上，是这一层最容易出的串台。 */
    expect(readAuthorStats(mine).totalViews).toBe(0);
    expect(readAuthorStats(theirs.account.id).totalViews).toBe(1);
  });
});
