import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchPrivacy,
  fetchSession,
  login as loginRequest,
  publishPost,
  register as registerRequest,
  setFollowing as setFollowingRequest,
  type AccountSummary,
  type ApiResult,
  type MarketColorMode,
  type SessionSnapshot,
  type SocialPost,
} from "../api/social-api";

/*
 * 真实账号会话。
 *
 * 与网页版同一批接口、同一批账号——手机上注册的账号，网页上登得进去。
 *
 * 令牌存 Keychain（expo-secure-store），不是 AsyncStorage：后者是明文文件，
 * 越狱设备或备份里都能直接读到。这一点和网页版不同——浏览器里没有 Keychain
 * 这种东西，那边只能放 localStorage、靠 CSP 兜底；手机上有更好的地方可放，
 * 就该放在那儿。
 */

const TOKEN_KEY = "huoqiu.account.token";

type SessionState = Readonly<{
  /** 取数失败的原因。null 表示这一轮没有失败。 */
  failure: string | null;
  /** 首次取数完成前为 true。用于区分「还没问」和「问了，是空的」。 */
  loading: boolean;
  snapshot: SessionSnapshot;
}>;

const EMPTY_SNAPSHOT: SessionSnapshot = {
  account: null,
  accounts: [],
  bookmarkedPostIds: [],
  following: [],
  likedPostIds: [],
  posts: [],
};

type AccountSessionValue = Readonly<{
  account: AccountSummary | null;
  accounts: readonly AccountSummary[];
  /*
   * 我赞过、收藏过哪些帖子。
   *
   * 必须从服务端快照来，不能由详情页自己在本地记：本地记的话，退出这一页
   * 再进来就回到「没赞过」，而服务端明明记着——用户以为刚才那下没生效，
   * 再点一次，正好把赞取消掉。
   */
  bookmarkedPostIds: readonly string[];
  /*
   * 以当前身份发一次请求。
   *
   * 交出的是「能以我的身份问一次」的能力，不是令牌本身——令牌散给的组件
   * 越多，被写进日志、拼进地址、随手转发的机会就越多。
   *
   * 没登录时不发请求，直接回 rejected：让每个调用点各自判断「有没有令牌」，
   * 迟早有一处忘了判，然后带着 null 打过去，拿回一个 401 当成服务端故障。
   */
  callAs: <T>(
    call: (token: string) => Promise<ApiResult<T>>,
  ) => Promise<ApiResult<T>>;
  failure: string | null;
  following: readonly string[];
  likedPostIds: readonly string[];
  loading: boolean;
  /*
   * 涨跌配色。
   *
   * 放在会话里而不是设置页本地：它要影响每一个显示涨跌的页面，而设置页只是
   * 改它的地方。此前它只存在设置页自己的状态里，选完打了勾，行情一点没变。
   */
  marketColors: MarketColorMode;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  posts: readonly SocialPost[];
  publish: (title: string, body: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  register: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<string | null>;
  toggleFollow: (targetId: string) => Promise<string | null>;
}>;

const AccountSessionContext = createContext<AccountSessionValue | null>(null);

/* 失败信息统一在这里取出来，省得每个调用点各写一遍 kind 判断。 */
const failureOf = <T,>(result: ApiResult<T>): string | null =>
  result.kind === "ok" ? null : result.message;

export function AccountSessionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [token, setToken] = useState<string | null>(null);
  const [marketColors, setMarketColors] = useState<MarketColorMode>("red-up");
  const [state, setState] = useState<SessionState>({
    failure: null,
    loading: true,
    snapshot: EMPTY_SNAPSHOT,
  });

  const load = useCallback(async (current: string | null) => {
    /*
     * 顺带取一次配色。未登录时服务端回默认档而不是 401，所以这一条不用等
     * 登录，也不必单独处理失败——取不到就沿用上一次的值。
     */
    void fetchPrivacy(current).then((privacy) => {
      if (privacy.kind === "ok") setMarketColors(privacy.value.marketColors);
    });

    const result = await fetchSession(current);
    if (result.kind === "ok") {
      setState({ failure: null, loading: false, snapshot: result.value });
      return;
    }
    /*
     * 取数失败时保留上一份快照，不要清空。
     *
     * 网络抖一下就把已经看到的内容抹掉，用户会以为自己的帖子没了。
     * 失败只反映在 failure 上，由界面决定怎么提示。
     */
    setState((previous) => ({
      failure: result.message,
      loading: false,
      snapshot: previous.snapshot,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    /* Keychain 读不到就当没登录，不要把 App 卡在启动画面上。 */
    const readStoredToken = async (): Promise<string | null> => {
      try {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      } catch {
        return null;
      }
    };

    const restore = async () => {
      const stored = await readStoredToken();
      if (cancelled) return;
      setToken(stored);
      await load(stored);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const adopt = useCallback(
    async (issued: string) => {
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, issued);
      } catch {
        /*
         * 存不进去也要让这一次登录生效，否则用户看到的是「登录成功但仍未登录」。
         * 代价只是下次冷启动要重新登录。
         */
      }
      setToken(issued);
      await load(issued);
    },
    [load],
  );

  const register = useCallback(
    async (displayName: string, email: string, password: string) => {
      const result = await registerRequest(displayName, email, password);
      if (result.kind === "ok") await adopt(result.value);
      return failureOf(result);
    },
    [adopt],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginRequest(email, password);
      if (result.kind === "ok") await adopt(result.value);
      return failureOf(result);
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      /* 删不掉也要退出当前会话，否则界面上退不出去。 */
    }
    setToken(null);
    setState({ failure: null, loading: false, snapshot: EMPTY_SNAPSHOT });
  }, []);

  const toggleFollow = useCallback(
    async (targetId: string) => {
      if (token === null) return "请先登录。";
      const next = !state.snapshot.following.includes(targetId);
      const result = await setFollowingRequest(token, targetId, next);
      if (result.kind === "ok") await load(token);
      return failureOf(result);
    },
    [load, state.snapshot.following, token],
  );

  const publish = useCallback(
    async (title: string, body: string) => {
      if (token === null) return "请先登录。";
      const result = await publishPost(token, title, body);
      if (result.kind === "ok") await load(token);
      return failureOf(result);
    },
    [load, token],
  );

  const refresh = useCallback(async () => {
    await load(token);
  }, [load, token]);

  const callAs = useCallback(
    async <T,>(
      call: (issued: string) => Promise<ApiResult<T>>,
    ): Promise<ApiResult<T>> => {
      if (token === null) {
        return { kind: "rejected", message: "请先登录。" };
      }
      return call(token);
    },
    [token],
  );

  const value = useMemo<AccountSessionValue>(
    () => ({
      account: state.snapshot.account,
      accounts: state.snapshot.accounts,
      bookmarkedPostIds: state.snapshot.bookmarkedPostIds,
      callAs,
      failure: state.failure,
      following: state.snapshot.following,
      likedPostIds: state.snapshot.likedPostIds,
      loading: state.loading,
      marketColors,
      login,
      logout,
      posts: state.snapshot.posts,
      publish,
      refresh,
      register,
      toggleFollow,
    }),
    [
      callAs,
      login,
      logout,
      marketColors,
      publish,
      refresh,
      register,
      state.failure,
      state.loading,
      state.snapshot,
      toggleFollow,
    ],
  );

  return (
    <AccountSessionContext.Provider value={value}>
      {children}
    </AccountSessionContext.Provider>
  );
}

export function useAccountSession(): AccountSessionValue {
  const value = useContext(AccountSessionContext);
  if (value === null) {
    throw new Error("useAccountSession 必须在 AccountSessionProvider 内使用");
  }
  return value;
}
