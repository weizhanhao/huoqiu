import type { StudioPost } from "./studio-data";

/*
 * 创作者中心三张列表的筛选条件。
 *
 * 提出来是因为它必须能跨 RSC 边界传：页面是服务端组件，列表是客户端
 * 组件，函数传不过去（构建会直接失败，而单测里 renderToStaticMarkup
 * 不校验这条边界，一路绿到构建才炸）。传一个字符串，筛选逻辑留在
 * 客户端这一侧。
 */
export const studioScopes = [
  "draft-article",
  "draft-discussion",
  "published",
] as const;

export type StudioScope = (typeof studioScopes)[number];

/** 帖子的公开地址。草稿没有公开地址，调用方要先判 status。 */
export const postPermalink = (postId: string): string =>
  `/community/posts/${postId}`;

export const selectStudioPosts = (
  posts: readonly StudioPost[],
  scope: StudioScope,
): readonly StudioPost[] => {
  if (scope === "published") {
    return posts.filter((post) => post.status === "published");
  }
  const kind = scope === "draft-article" ? "article" : "discussion";
  return posts.filter((post) => post.status === "draft" && post.kind === kind);
};
