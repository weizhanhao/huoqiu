import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as privacyGet } from "../../src/app/api/social/privacy/route";
import { issueSession } from "../../src/server/session";
import {
  createComment,
  createPost,
  getCommentPolicy,
  registerAccount,
  setCommentPolicy,
  setFollow,
} from "../../src/server/social-store";

/*
 * 谁可以评论我发布的讨论。
 *
 * 设置页给了五档，但「存下来」和「生效」是两件事：只存不执行，那个单选框
 * 就是个摆设——用户以为自己关掉了评论，其实谁都还能评。
 *
 * 所以这里五档逐个验证，而且正反各来一次：该放行的要放行，该挡住的要挡住。
 * 只测「挡住」的话，一个永远返回 false 的实现也能全绿。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-privacy-"));
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

/** 作者张远发一条帖；另有一个路人林曦。 */
const stage = (policy?: string) => {
  const author = account("author@example.com", "张远");
  const other = account("other@example.com", "林曦");
  const written = createPost({
    accountId: author.id,
    body: "先记录事实。",
    now: NOW,
    title: "我的第一条记录",
  });
  if ("error" in written) throw new Error(written.error);
  if (policy !== undefined) {
    setCommentPolicy({ accountId: author.id, now: NOW, policy });
  }
  return { author, other, postId: written.post.id };
};

const commentBy = (accountId: string, postId: string) =>
  createComment({ accountId, body: "一条评论。", now: NOW, postId });

const REFUSED = { error: "作者限制了评论范围，你暂时无法评论。" };

describe("who can comment on my posts", () => {
  it("defaults to everyone rather than silently tightening", () => {
    const author = account("author@example.com", "张远");

    // 没设置过就该是最宽松的那档，不该替用户做收紧的决定。
    expect(getCommentPolicy(author.id)).toBe("everyone");
  });

  it("lets anyone comment under the everyone policy", () => {
    const { other, postId } = stage("everyone");

    expect(commentBy(other.id, postId)).toHaveProperty("comment");
  });

  it("turns comments off for everyone but the author", () => {
    const { author, other, postId } = stage("off");

    expect(commentBy(other.id, postId)).toEqual(REFUSED);
    // 关闭评论不该把作者自己也挡在外面。
    expect(commentBy(author.id, postId)).toHaveProperty("comment");
  });

  it("restricts to accounts the author follows", () => {
    const { author, other, postId } = stage("following");

    expect(commentBy(other.id, postId)).toEqual(REFUSED);

    /*
     * 「我关注的人」看的是作者关注了谁，方向是 作者 → 对方。
     * 写反就会变成「关注我的人」，效果恰好颠倒，而界面上完全看不出来。
     */
    setFollow({
      followeeId: other.id,
      followerId: author.id,
      following: true,
      now: NOW,
    });
    expect(commentBy(other.id, postId)).toHaveProperty("comment");
  });

  it("restricts to accounts that follow the author", () => {
    const { author, other, postId } = stage("followers");

    expect(commentBy(other.id, postId)).toEqual(REFUSED);

    // 方向相反：对方 → 作者。
    setFollow({
      followeeId: author.id,
      followerId: other.id,
      following: true,
      now: NOW,
    });
    expect(commentBy(other.id, postId)).toHaveProperty("comment");
  });

  it("requires three days of following, not merely a follow", () => {
    const { author, other, postId } = stage("followers-3d");

    // 刚关注就评论：不满三天，挡住。
    setFollow({
      followeeId: author.id,
      followerId: other.id,
      following: true,
      now: "2026-08-12T00:00:00.000Z",
    });
    expect(commentBy(other.id, postId)).toEqual(REFUSED);

    // 关注满三天之后放行——只挡不放的实现在这一步会露馅。
    setFollow({
      followeeId: author.id,
      followerId: other.id,
      following: true,
      now: "2026-08-01T00:00:00.000Z",
    });
    expect(commentBy(other.id, postId)).toHaveProperty("comment");
  });

  it("refuses a policy value that is not one of the five", () => {
    const author = account("author@example.com", "张远");

    /*
     * 存进一个认不出的值，评论权限就变成未定义行为：判断分支全部落空，
     * 实际效果取决于代码里最后那个 else，而不是用户的选择。
     */
    expect(
      setCommentPolicy({ accountId: author.id, now: NOW, policy: "nobody" }),
    ).toEqual({ error: "无效的评论权限设置。" });
    expect(getCommentPolicy(author.id)).toBe("everyone");
  });

  it("never hands one account's privacy setting to another", async () => {
    const { author } = stage("off");
    const stranger = account("third@example.com", "陈默");
    const token = issueSession(stranger.id, Date.now() / 1000) ?? "";

    const response = await privacyGet(
      new Request(`https://example.test/api?account=${author.id}`, {
        headers: { "x-huoqiu-session": token },
      }),
    );
    const data = (await response.json()) as { commentPolicy: string };

    // 查询串里写别人的 id 不该有任何效果——这条端点从来不看它。
    expect(data.commentPolicy).toBe("everyone");
  });
});
