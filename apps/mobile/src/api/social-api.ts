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
