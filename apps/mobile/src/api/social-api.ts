import { apiUrl } from "./config";

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

/*
 * 取数结果分三种，不是两种。
 *
 * 「连不上」和「服务端说不行」必须分开：前者是网络问题（手机不在内网时会
 * 一直是它），后者是业务拒绝（密码太短、邮箱重复）。混成一句「加载失败」，
 * 用户会朝错误的方向排查——反复改密码，而其实是没连上那个网。
 */
export type ApiResult<T> =
  | Readonly<{ kind: "ok"; value: T }>
  | Readonly<{ kind: "offline"; message: string }>
  | Readonly<{ kind: "rejected"; message: string }>;

const OFFLINE_MESSAGE = "连不上服务器。确认手机和服务在同一个网络里。";

const SESSION_HEADER = "x-huoqiu-session";

const authHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { [SESSION_HEADER]: token };

type JsonBody = Readonly<Record<string, unknown>>;

/* 服务端把失败原因放在 error 字段里（见 social/login、social/register）。 */
const readError = (body: unknown, fallback: string): string => {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as Readonly<{ error?: unknown }>;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
};

const request = async <T>(
  path: string,
  init: Readonly<{ body?: JsonBody; method: string; token: string | null }>,
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      headers: {
        ...authHeaders(init.token),
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      method: init.method,
    });
  } catch {
    /* fetch 只在连不上时 reject；HTTP 4xx/5xx 是正常 resolve。 */
    return { kind: "offline", message: OFFLINE_MESSAGE };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      kind: "rejected",
      message: `服务端返回了读不懂的内容（HTTP ${String(response.status)}）。`,
    };
  }

  if (!response.ok) {
    return {
      kind: "rejected",
      message: readError(
        parsed,
        `请求失败（HTTP ${String(response.status)}）。`,
      ),
    };
  }

  return { kind: "ok", value: parsed as T };
};

export const fetchSession = async (
  token: string | null,
): Promise<ApiResult<SessionSnapshot>> =>
  request<SessionSnapshot>("/api/social/me", { method: "GET", token });

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
