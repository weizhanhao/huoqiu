"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useBrowserStore, writeBrowserStore } from "../../lib/browser-store";

/*
 * 真实账号会话。
 *
 * 为什么令牌放在 localStorage 而不是 cookie：
 * 受保护预览的网关会用固定的传输层 cookie **替换**整个 Cookie 头
 * （apps/preview/src/gateway.mjs），浏览器自己的 cookie 到不了应用。
 * 所以凭证由客户端保管，用专用请求头带给 API。
 *
 * 这段说明以前写着「不是面向公网的鉴权方案，真正的会话令牌之后再做」——
 * 那已经过时了：现在带的是服务端 HMAC 签发、带有效期和世代号的令牌，
 * 接口一律以它判定身份，不再看请求体里的账号 id。留着旧说法会让人以为
 * 这里还是那个可以随手冒充的状态。
 *
 * 仍需注意的是存储位置本身：localStorage 挡不住 XSS，因此站内的 CSP 与
 * 富文本转义是这套方案的前提，而不是可选项。
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
  /** 真实赞数，由服务端按 likes 表现算；旧响应没有这个字段时按 0 处理。 */
  likeCount?: number;
  title: string;
}>;

type AccountSessionValue = Readonly<{
  account: AccountSummary | null;
  accounts: readonly AccountSummary[];
  following: readonly string[];
  /*
   * 我赞过的帖子。
   *
   * 点赞过去只活在客户端会话里：刷新即失，别人也看不到，于是通知里的
   * 「赞我的」永远是空的——不是没人赞，是赞根本没留下过。
   */
  likedPostIds: readonly string[];
  toggleLike: (postId: string) => Promise<string | null>;
  /*
   * 我收藏过的帖子。
   *
   * 个人主页有「收藏」页签，此前没有任何存储支撑它——页签在那儿，
   * 点开永远是空的。
   */
  bookmarkedPostIds: readonly string[];
  toggleBookmark: (postId: string) => Promise<string | null>;
  /** 首次拉取完成前为 true；用于占位，避免数字跳变。 */
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  posts: readonly SocialPost[];
  /** quotedPostId 非空时是一条转发：正文是转发语，原帖以引用块呈现。 */
  publish: (
    title: string,
    body: string,
    quotedPostId?: string,
  ) => Promise<string | null>;
  refresh: () => Promise<void>;
  register: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<string | null>;
  toggleFollow: (targetId: string) => Promise<string | null>;
  /*
   * 带会话令牌的 fetch。
   *
   * 私信那一块要自己调接口，但不该为此把原始令牌散给各个组件——令牌交出去
   * 越多，写进日志、塞进 URL、随手转发的机会就越多。这里只交出「能以我的
   * 身份发一次请求」的能力。
   */
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  /*
   * 接收服务端回签的新令牌。
   *
   * 改密码时账号的令牌世代号会 +1，此前所有票据当场作废——包括界面里正拿着
   * 的这一张。服务端回签了一张新的，这里必须换上，否则用户改完密码会被
   * 自己踢下线。
   */
  adoptToken: (token: string) => void;
}>;

/*
 * 存的是会话令牌，不再是账号 id。
 *
 * 早先这里存 huoqiu.account.id，请求时把它当身份发给接口——而那个 id 是
 * 公开的，就印在个人主页地址里。等于任何人抄一条主页链接就能冒充。
 * 现在存服务端签发的令牌：签过名、有有效期，改一个字节就验不过。
 *
 * 键名也换了。旧键里存的东西已经不是凭证，留着只会让人以为还能用。
 */
const TOKEN_KEY = "huoqiu.account.token";

/* 令牌就是存进去的那个字符串，不需要解析。 */
const identity = (raw: string | null): string | null => raw;

type MeResponse = Readonly<{
  account: AccountSummary | null;
  accounts: readonly AccountSummary[];
  bookmarkedPostIds?: readonly string[];
  following: readonly string[];
  likedPostIds?: readonly string[];
  posts: readonly SocialPost[];
}>;

/** 只取数、不碰状态；取不到回 null。 */
const fetchMe = async (current: string | null): Promise<MeResponse | null> => {
  try {
    // 身份走认证头，不再拼进查询串——查询串里的 id 谁都能改。
    const response = await fetch("/api/social/me", {
      cache: "no-store",
      headers: authHeaders(current),
    });
    return (await response.json()) as MeResponse;
  } catch {
    return null;
  }
};

const AccountSessionContext = createContext<AccountSessionValue | null>(null);

/*
 * 令牌走专用头，不占用 Authorization。
 *
 * 预览网关自己用 Authorization: Basic 做接入鉴权，而且只透传白名单里的请求头。
 * 把令牌塞进 Authorization 会同时踩两个坑：覆盖掉网关要的 Basic，且这个头
 * 本来就不在透传名单里，到不了应用。
 */
const authHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { "x-huoqiu-session": token };

const postJson = async (
  path: string,
  body: unknown,
  token: string | null = null,
): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...authHeaders(token) },
    method: "POST",
  });
  /*
   * 响应体不是 JSON 时按空对象处理：调用方只从里面取 error 字段，
   * 取不到会退回自己的兜底文案，不该因为解析失败就整个抛出去。
   */
  const data = await response
    .json()
    .then((parsed: unknown) => parsed as Record<string, unknown>)
    .catch(() => ({}) as Record<string, unknown>);
  return { data, ok: response.ok };
};

export function AccountSessionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  /*
   * 令牌直接订阅浏览器存储。
   *
   * 原先是「先渲染成未登录、挂载后读一次再 setToken」——已登录的人每次
   * 打开页面都会先看到一帧未登录的界面。订阅之后首帧就是对的（服务端快照
   * 仍然是 null，水合后一步换成真实令牌），而且一处登出、所有标签页同步。
   */
  const token = useBrowserStore(TOKEN_KEY, identity, null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [accounts, setAccounts] = useState<readonly AccountSummary[]>([]);
  const [following, setFollowing] = useState<readonly string[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<readonly string[]>([]);
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<readonly string[]>(
    [],
  );
  const [posts, setPosts] = useState<readonly SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  /* 把一次 /me 的结果铺到各项状态上。取数本身见模块级的 fetchMe。 */
  const apply = (current: string | null, data: MeResponse | null): void => {
    if (data === null) {
      setAccount(null);
      setLoading(false);
      return;
    }
    setAccount(data.account);
    setAccounts(data.accounts ?? []);
    setFollowing(data.following ?? []);
    setBookmarkedPostIds(data.bookmarkedPostIds ?? []);
    setLikedPostIds(data.likedPostIds ?? []);
    setPosts(data.posts ?? []);
    setLoading(false);
    /*
     * 令牌过期、账号被删或存储被清空时，把本地令牌一并丢掉。
     * 否则界面会一直顶着一个服务端已经不认的身份，每次操作都失败。
     */
    if (current !== null && data.account === null) {
      writeBrowserStore(TOKEN_KEY, null);
    }
  };

  const load = useCallback(
    async (current: string | null): Promise<void> => {
      apply(current, await fetchMe(current));
    },
    // apply 每次渲染都是新的，但它只写状态、不读渲染期的值，不必进依赖。
    [],
  );

  /*
   * 令牌变了就重新确认身份。
   *
   * 取数做成不碰状态的纯函数（fetchMe），状态更新在 await 之后才发生。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchMe(token);
      if (!cancelled) apply(token, data);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const adopt = useCallback((next: AccountSummary, issued: string) => {
    writeBrowserStore(TOKEN_KEY, issued);
    setAccount(next);
  }, []);

  const register = useCallback<AccountSessionValue["register"]>(
    async (displayName, email, password) => {
      const { data, ok } = await postJson("/api/social/register", {
        display_name: displayName,
        email,
        password,
      });
      if (!ok) return (data.error as string) ?? "注册失败。";
      const next = data.account as AccountSummary;
      const issued = typeof data.token === "string" ? data.token : null;
      // 没拿到令牌就等于没登录成功，不能只把账号显示出来让人以为可以用了。
      if (issued === null) return "注册成功但未能建立会话，请重新登录。";
      adopt(next, issued);
      await load(issued);
      return null;
    },
    [adopt, load],
  );

  const login = useCallback<AccountSessionValue["login"]>(
    async (email, password) => {
      const { data, ok } = await postJson("/api/social/login", {
        email,
        password,
      });
      if (!ok) return (data.error as string) ?? "登录失败。";
      const next = data.account as AccountSummary;
      const issued = typeof data.token === "string" ? data.token : null;
      if (issued === null) return "登录成功但未能建立会话，请稍后重试。";
      adopt(next, issued);
      await load(issued);
      return null;
    },
    [adopt, load],
  );

  const logout = useCallback(() => {
    writeBrowserStore(TOKEN_KEY, null);
    void load(null);
  }, [load]);

  const publish = useCallback<AccountSessionValue["publish"]>(
    async (title, body, quotedPostId) => {
      if (token === null) return "请先登录后再发布。";
      // 作者由令牌决定，请求体里不再带 account——带了服务端也不会看。
      const { data, ok } = await postJson(
        "/api/social/posts",
        {
          body,
          ...(quotedPostId === undefined
            ? {}
            : { quoted_post_id: quotedPostId }),
          title,
        },
        token,
      );
      if (!ok) return (data.error as string) ?? "发布失败。";
      await load(token);
      return null;
    },
    [load, token],
  );

  const toggleFollow = useCallback<AccountSessionValue["toggleFollow"]>(
    async (targetId) => {
      if (token === null) return "请先登录后再关注。";
      const { data, ok } = await postJson(
        "/api/social/follow",
        {
          following: !following.includes(targetId),
          target: targetId,
        },
        token,
      );
      if (!ok) return (data.error as string) ?? "操作失败。";
      await load(token);
      return null;
    },
    [following, load, token],
  );

  const toggleLike = useCallback<AccountSessionValue["toggleLike"]>(
    async (postId) => {
      if (token === null) return "请先登录后再点赞。";
      const { data, ok } = await postJson(
        "/api/social/likes",
        { liked: !likedPostIds.includes(postId), post: postId },
        token,
      );
      if (!ok) return (data.error as string) ?? "操作失败。";
      // 重新拉一次而不是本地加一：赞数是服务端现算的，以它为准。
      await load(token);
      return null;
    },
    [likedPostIds, load, token],
  );

  const toggleBookmark = useCallback<AccountSessionValue["toggleBookmark"]>(
    async (postId) => {
      if (token === null) return "请先登录后再收藏。";
      const { data, ok } = await postJson(
        "/api/social/bookmarks",
        { bookmarked: !bookmarkedPostIds.includes(postId), post: postId },
        token,
      );
      if (!ok) return (data.error as string) ?? "操作失败。";
      await load(token);
      return null;
    },
    [bookmarkedPostIds, load, token],
  );

  const refresh = useCallback(async () => {
    await load(token);
  }, [load, token]);

  const adoptToken = useCallback(
    (issued: string) => {
      writeBrowserStore(TOKEN_KEY, issued);
      void load(issued);
    },
    [load],
  );

  const authorizedFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(path, {
        ...init,
        headers: { ...init.headers, ...authHeaders(token) },
      }),
    [token],
  );

  const value = useMemo<AccountSessionValue>(
    () => ({
      account,
      accounts,
      adoptToken,
      authorizedFetch,
      bookmarkedPostIds,
      following,
      likedPostIds,
      toggleBookmark,
      loading,
      login,
      logout,
      posts,
      publish,
      refresh,
      register,
      toggleFollow,
      toggleLike,
    }),
    [
      account,
      accounts,
      adoptToken,
      authorizedFetch,
      bookmarkedPostIds,
      following,
      likedPostIds,
      toggleBookmark,
      loading,
      login,
      logout,
      posts,
      publish,
      refresh,
      register,
      toggleFollow,
      toggleLike,
    ],
  );

  return (
    <AccountSessionContext.Provider value={value}>
      {children}
    </AccountSessionContext.Provider>
  );
}

/** Provider 缺失时返回静态空实现，避免独立挂载的测试 harness 被拖垮。 */
export function useAccountSession(): AccountSessionValue {
  const value = useContext(AccountSessionContext);
  return (
    value ?? {
      account: null,
      accounts: [],
      adoptToken: () => undefined,
      bookmarkedPostIds: [],
      toggleBookmark: async () => "账号服务不可用。",
      // 没有 Provider 就没有会话，这里直接给一个 401，别让调用方以为发出去了。
      authorizedFetch: async () =>
        new Response(JSON.stringify({ error: "账号服务不可用。" }), {
          status: 401,
        }),
      following: [],
      likedPostIds: [],
      toggleLike: async () => "账号服务不可用。",
      loading: false,
      login: async () => "账号服务不可用。",
      logout: () => undefined,
      posts: [],
      publish: async () => "账号服务不可用。",
      refresh: async () => undefined,
      register: async () => "账号服务不可用。",
      toggleFollow: async () => "账号服务不可用。",
    }
  );
}
