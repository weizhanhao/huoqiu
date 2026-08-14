import { describe, expect, it } from "vitest";

import {
  postPermalink,
  selectStudioPosts,
} from "../../../src/features/studio/select-posts";
import type { StudioPost } from "../../../src/features/studio/studio-data";

/*
 * 创作者中心三张列表的筛选。
 *
 * 「我的作品」「讨论草稿」「长文草稿」共用一个列表组件，区别只在这一层。
 * 分错的后果是安静的：草稿混进「我的作品」，作者以为已经发出去了；
 * 长文草稿落进讨论草稿箱，他会在另一个箱子里翻半天。两种都不会报错。
 */

const post = (
  id: string,
  kind: StudioPost["kind"],
  status: StudioPost["status"],
): StudioPost => ({
  body: "正文",
  created_at: "2026-08-14T01:00:00.000Z",
  id,
  kind,
  status,
  title: `标题 ${id}`,
  updated_at: "2026-08-14T01:00:00.000Z",
  views: 0,
});

const POSTS: readonly StudioPost[] = [
  post("a", "discussion", "published"),
  post("b", "article", "published"),
  post("c", "discussion", "draft"),
  post("d", "article", "draft"),
];

describe("studio list scopes", () => {
  it("puts only published posts in 我的作品", () => {
    const ids = selectStudioPosts(POSTS, "published").map((row) => row.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("keeps the two draft boxes apart by kind", () => {
    /*
     * 两个草稿箱都只筛 status === "draft" 的话，两边内容一模一样——
     * 页面标题不同、列表相同，看着像重复了一遍。
     */
    expect(
      selectStudioPosts(POSTS, "draft-discussion").map((row) => row.id),
    ).toEqual(["c"]);
    expect(
      selectStudioPosts(POSTS, "draft-article").map((row) => row.id),
    ).toEqual(["d"]);
  });

  it("never lets a draft into a published scope", () => {
    // 反过来说一遍：草稿出现在「我的作品」里，作者会以为它已经发出去了。
    for (const row of selectStudioPosts(POSTS, "published")) {
      expect(row.status).toBe("published");
    }
  });

  it("links a published post at the address that route actually serves", () => {
    /*
     * 站内帖子的真实路由是 /community/posts/[postId]。列表里一度写的是
     * /posts/{id}——那条路由不存在，点开就是 404，而列表本身看不出问题。
     */
    expect(postPermalink("post_0123456789abcdef")).toBe(
      "/community/posts/post_0123456789abcdef",
    );
  });
});
