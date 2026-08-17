import { request, type ApiResult } from "./request";

export type { ApiResult } from "./request";

/*
 * 社交接口。
 *
 * 与网页版调的是同一批路由（apps/web/src/app/api/social/*），所以手机上注册的
 * 账号，网页上能登进去；网页上关注的人，手机上也在。两端各建一套账号体系是
 * 最容易走错的一步——那样「同一个产品」就只是看起来像。
 *
 * 身份走 x-huoqiu-session 头，值是服务端 HMAC 签发的令牌。不要把账号 id
 * 当身份发过去：那个 id 就印在个人主页地址里，谁都能抄。
 */

export type AccountSummary = Readonly<{
  createdAt: string;
  displayName: string;
  email: string;
  followerCount: number;
  followingCount: number;
  id: string;
  postCount: number;
}>;

export type SocialPost = Readonly<{
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  likeCount?: number;
  title: string;
}>;

export type SessionSnapshot = Readonly<{
  account: AccountSummary | null;
  accounts: readonly AccountSummary[];
  bookmarkedPostIds: readonly string[];
  following: readonly string[];
  likedPostIds: readonly string[];
  posts: readonly SocialPost[];
}>;

export const fetchSession = async (
  token: string | null,
): Promise<ApiResult<SessionSnapshot>> =>
  request<SessionSnapshot>("/api/social/me", { method: "GET", token });

/*
 * 公开的帖子列表，不需要登录。
 *
 * 首页那些频道（推荐、热门、基金、资讯、私募、ETF）在参考图里不登录也有内容。
 * 只用 /api/social/me 的话，未登录进来看到的是一片空白——那不是「还没关注人」，
 * 而是整个产品看起来是空的。
 */
export const fetchPublicPosts = async (): Promise<
  ApiResult<readonly SocialPost[]>
> => {
  const result = await request<Readonly<{ posts?: readonly SocialPost[] }>>(
    "/api/social/posts",
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.posts ?? [] };
};

/*
 * 帖子下的评论。
 *
 * parentId 指向被回复的那条；顶层评论没有这个字段。服务端把评论存成一张平表，
 * 树是详情页按 parentId 拼出来的——存成嵌套结构的话，「查看全部 8 条回复」
 * 要么一次拉整棵树，要么就拉不动。
 */
export type PostComment = Readonly<{
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  parentId?: string;
  postId: string;
}>;

export const fetchComments = async (
  postId: string,
): Promise<ApiResult<readonly PostComment[]>> => {
  const result = await request<Readonly<{ comments?: readonly PostComment[] }>>(
    `/api/social/comments?post=${encodeURIComponent(postId)}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.comments ?? [] };
};

export const publishComment = async (
  token: string,
  postId: string,
  body: string,
  parentId: string | null,
): Promise<ApiResult<unknown>> =>
  request("/api/social/comments", {
    body: {
      body,
      post: postId,
      ...(parentId === null ? {} : { parent: parentId }),
    },
    method: "POST",
    token,
  });

/* liked / bookmarked 是「操作之后应处于的状态」，不是「当前状态」。 */
export const setLiked = async (
  token: string,
  postId: string,
  liked: boolean,
): Promise<ApiResult<Readonly<{ likeCount: number }>>> =>
  request("/api/social/likes", {
    body: { liked, post: postId },
    method: "POST",
    token,
  });

export const setBookmarked = async (
  token: string,
  postId: string,
  bookmarked: boolean,
): Promise<ApiResult<Readonly<{ bookmarkCount: number }>>> =>
  request("/api/social/bookmarks", {
    body: { bookmarked, post: postId },
    method: "POST",
    token,
  });

/*
 * 别人的主页。
 *
 * 只有公开的那一部分：昵称、简介、关注数、发过的帖子。收藏和回复不在这里，
 * 那两样只有本人看得到。
 */
export type ProfilePost = Readonly<{
  body: string;
  href: string;
  id: string;
  publishedLabel: string;
  title: string;
}>;

export type UserProfile = Readonly<{
  bio: string;
  displayName: string;
  followerCount: number;
  followingCount: number;
  id: string;
  isRegisteredAccount: boolean;
  joinedLabel: string;
  postCount: number;
  posts: readonly ProfilePost[];
  role: string;
}>;

export const fetchUserProfile = async (
  accountId: string,
): Promise<ApiResult<UserProfile>> => {
  const result = await request<Readonly<{ profile?: UserProfile }>>(
    `/api/social/users/${encodeURIComponent(accountId)}`,
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return result.value.profile === undefined
    ? { kind: "rejected", message: "服务端没有返回这个账号的资料。" }
    : { kind: "ok", value: result.value.profile };
};

/*
 * 消息。
 *
 * 服务端从真实事件推导：谁关注了我、谁回复了我、谁赞了我、谁在正文里 @ 了我。
 * 没有「消息表」这种东西——事件本来就落在库里，通知只是它的另一种读法。
 *
 * 未登录时服务端回空列表而不是 401，所以这里也不必特殊处理。
 */
export type Notification = Readonly<{
  actorName: string;
  category: "follows" | "likes" | "mentions" | "replies";
  createdAt: string;
  href: string;
  id: string;
  isRead: boolean;
  kind: "comment" | "follow" | "like" | "mention" | "quote";
  summary: string;
  targetLabel: string;
}>;

export const fetchNotifications = async (
  token: string,
): Promise<ApiResult<readonly Notification[]>> => {
  const result = await request<
    Readonly<{ notifications?: readonly Notification[] }>
  >("/api/social/notifications", { method: "GET", token });
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.notifications ?? [] };
};

export const fetchTopics = async (): Promise<ApiResult<readonly string[]>> => {
  const result = await request<Readonly<{ topics?: readonly string[] }>>(
    "/api/social/topics",
    { method: "GET", token: null },
  );
  if (result.kind !== "ok") return result;
  return { kind: "ok", value: result.value.topics ?? [] };
};

type TokenResponse = Readonly<{ token?: unknown }>;

const readToken = (value: TokenResponse): ApiResult<string> =>
  typeof value.token === "string" && value.token.length > 0
    ? { kind: "ok", value: value.token }
    : { kind: "rejected", message: "服务端没有返回会话令牌。" };

const withToken = (result: ApiResult<TokenResponse>): ApiResult<string> =>
  result.kind === "ok" ? readToken(result.value) : result;

export const register = async (
  displayName: string,
  email: string,
  password: string,
): Promise<ApiResult<string>> =>
  withToken(
    await request<TokenResponse>("/api/social/register", {
      body: { display_name: displayName, email, password },
      method: "POST",
      token: null,
    }),
  );

export const login = async (
  email: string,
  password: string,
): Promise<ApiResult<string>> =>
  withToken(
    await request<TokenResponse>("/api/social/login", {
      body: { email, password },
      method: "POST",
      token: null,
    }),
  );

/* following 是「关注之后应处于的状态」，不是「当前状态」。 */
export const setFollowing = async (
  token: string,
  target: string,
  following: boolean,
): Promise<ApiResult<unknown>> =>
  request("/api/social/follow", {
    body: { following, target },
    method: "POST",
    token,
  });

/*
 * 帖子配图。
 *
 * 图片以 base64 装在 JSON 里传，不用 multipart——站内的 Web 边界会把每个请求
 * 体按 UTF-8 读出来扫一遍凭证，二进制的 multipart 过不了那道关。这是服务端
 * 定下的形状，这一侧照做。
 *
 * 服务端卡 512 KB。相机原图动辄好几兆，所以选图那边必须压过再送，不能指望
 * 这里兜底：兜不住的结果是用户选完图等半天，最后拿到一句「图片超过 512 KB」。
 */
export const uploadImage = async (
  token: string,
  base64: string,
): Promise<ApiResult<string>> => {
  const result = await request<Readonly<{ url?: unknown }>>(
    "/api/social/uploads",
    { body: { data: base64 }, method: "POST", token },
  );
  if (result.kind !== "ok") return result;
  return typeof result.value.url === "string" && result.value.url.length > 0
    ? { kind: "ok", value: result.value.url }
    : { kind: "rejected", message: "服务端没有返回图片地址。" };
};

export const publishPost = async (
  token: string,
  title: string,
  body: string,
): Promise<ApiResult<unknown>> =>
  request("/api/social/posts", {
    body: { body, title },
    method: "POST",
    token,
  });
