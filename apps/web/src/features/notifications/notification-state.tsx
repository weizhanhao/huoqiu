"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import { useAccountSession } from "../account/account-session";
import {
  notificationCategories,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-fixtures";

export {
  notificationCategories,
  syntheticNotifications,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-fixtures";

/*
 * 服务端推导出的真实事件，形状与界面用的通知不同，在这里转一次。
 * 与 src/server/social-store.ts 的 RealNotification 对应。
 */
type RealNotification = Readonly<{
  actorName: string;
  category: NotificationCategoryId;
  createdAt: string;
  href: string;
  id: string;
  isRead: boolean;
  kind: "follow" | "quote";
  summary: string;
  targetLabel: string;
}>;

const toDisplayNotification = (
  real: RealNotification,
): SyntheticNotification => ({
  action: real.kind === "follow" ? "关注了你" : "转发了你的帖子",
  actor: {
    initials: [...real.actorName][0] ?? "火",
    name: real.actorName,
  },
  category: real.category,
  createdAt: real.createdAt,
  id: real.id,
  isRead: real.isRead,
  summary: real.summary,
  target: { href: real.href, kind: "link", label: real.targetLabel },
  // 与样本条目同样的 MM-DD HH:mm，混排时不会有两种时间写法。
  timeLabel: `${real.createdAt.slice(5, 10)} ${real.createdAt.slice(11, 16)}`,
});

export type NotificationState = Readonly<{
  hiddenIds: readonly string[];
  notifications: readonly SyntheticNotification[];
}>;

export type NotificationAction =
  /*
   * 并入真实通知。
   *
   * 真实事件是登录后才异步拿到的，走不了 createNotificationState 的初始值。
   * 并进同一份列表而不是另存一份，是为了让隐藏、已读这些既有操作对真实通知
   * 一视同仁——否则用户会发现有些条目点了没反应。
   */
  | Readonly<{ notifications: readonly SyntheticNotification[]; type: "adopt" }>
  | Readonly<{ id: string; type: "hide" }>
  | Readonly<{ id: string; type: "mark-read" }>
  | Readonly<{ id: string; type: "mark-unread" }>
  | Readonly<{ type: "mark-all-read" }>;

export type NotificationUnreadCounts = Readonly<{
  byCategory: Readonly<Record<NotificationCategoryId, number>>;
  total: number;
}>;

/*
 * 默认是空的，不是那批样本。
 *
 * 这里原先默认塞进六条虚构通知，其中五条未读——于是顶栏和左栏的未读徽标
 * 在任何人、任何页面上都恒定显示「5」。通知页至少还写着「以下为离线样本」，
 * 徽标没有任何说明，就是一个红点加一个数字：打开站点第一眼看到的是
 * 「你有 5 条未读」，而那五件事一件都没发生过。
 *
 * 真实通知登录后由 adopt 整体替换进来。没有真实通知时就该是零。
 */
export const createNotificationState = (
  initialNotifications: readonly SyntheticNotification[] = [],
): NotificationState => ({
  hiddenIds: [],
  notifications: initialNotifications.map((notification) => ({
    ...notification,
  })),
});

const updateReadState = (
  state: NotificationState,
  id: string,
  isRead: boolean,
): NotificationState => ({
  ...state,
  notifications: state.notifications.map((notification) =>
    notification.id === id ? { ...notification, isRead } : notification,
  ),
});

export const notificationReducer = (
  state: NotificationState,
  action: NotificationAction,
): NotificationState => {
  switch (action.type) {
    case "adopt": {
      /*
       * 已经隐藏过的不再冒出来，已经在列表里的不重复插入。
       * 少了任何一条，每次轮询都会把用户刚划掉的通知再塞回去。
       */
      const known = new Set([
        ...state.hiddenIds,
        ...state.notifications.map(({ id }) => id),
      ]);
      const fresh = action.notifications.filter(({ id }) => !known.has(id));
      if (fresh.length === 0) return state;
      return { ...state, notifications: [...fresh, ...state.notifications] };
    }
    case "hide":
      if (!state.notifications.some(({ id }) => id === action.id)) return state;
      return {
        hiddenIds: [...state.hiddenIds, action.id],
        notifications: state.notifications.filter(({ id }) => id !== action.id),
      };
    case "mark-all-read":
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.isRead
            ? notification
            : { ...notification, isRead: true },
        ),
      };
    case "mark-read":
      return updateReadState(state, action.id, true);
    case "mark-unread":
      return updateReadState(state, action.id, false);
  }
};

export const notificationUnreadCounts = (
  state: NotificationState,
): NotificationUnreadCounts => {
  /*
   * 从分类表推导，而不是写死一份键。
   *
   * 写死的话，新增分类时这里不改就会得到 undefined，再 +1 变成 NaN——
   * 徽标上显示 NaN，而类型检查在加分类那一刻才报错，很容易被顺手补个 0 敷衍
   * 过去。推导出来就没有这个漏项的机会。
   */
  const byCategory = Object.fromEntries(
    notificationCategories.map(({ id }) => [id, 0]),
  ) as Record<NotificationCategoryId, number>;
  let total = 0;

  for (const notification of state.notifications) {
    if (notification.isRead) continue;
    byCategory[notification.category] += 1;
    total += 1;
  }

  return { byCategory, total };
};

type NotificationSessionContextValue = Readonly<{
  counts: NotificationUnreadCounts;
  hide: (id: string) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  notifications: readonly SyntheticNotification[];
}>;

const NotificationSessionContext =
  createContext<NotificationSessionContextValue | null>(null);

type NotificationSessionProviderProperties = Readonly<{
  children: ReactNode;
  initialNotifications?: readonly SyntheticNotification[];
}>;

export function NotificationSessionProvider({
  children,
  // 同上：不给就是没有通知，而不是一批编出来的未读。
  initialNotifications = [],
}: NotificationSessionProviderProperties) {
  const [state, dispatch] = useReducer(
    notificationReducer,
    initialNotifications,
    createNotificationState,
  );
  /*
   * 拉真实通知。
   *
   * 关注、转发这些事件早就落在库里了，只是没人去读——真实账号被真人关注，
   * 通知页却只显示虚构角色的固定样本。
   *
   * 拿不到就什么都不做：宁可只剩样本，也不要在这里编一条「加载失败」的
   * 通知混进真实事件里。
   */
  const { account, authorizedFetch } = useAccountSession();
  useEffect(() => {
    if (account === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch("/api/social/notifications", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          notifications?: readonly RealNotification[];
        };
        if (cancelled || data.notifications === undefined) return;
        dispatch({
          notifications: data.notifications.map(toDisplayNotification),
          type: "adopt",
        });
      } catch {
        // 网络失败不改变界面：样本内容照旧，不冒充成真实事件。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  const hide = useCallback((id: string) => {
    dispatch({ id, type: "hide" });
  }, []);
  const markAllRead = useCallback(() => {
    dispatch({ type: "mark-all-read" });
  }, []);
  const markRead = useCallback((id: string) => {
    dispatch({ id, type: "mark-read" });
  }, []);
  const markUnread = useCallback((id: string) => {
    dispatch({ id, type: "mark-unread" });
  }, []);
  const counts = useMemo(() => notificationUnreadCounts(state), [state]);
  const value = useMemo(
    () => ({
      counts,
      hide,
      markAllRead,
      markRead,
      markUnread,
      notifications: state.notifications,
    }),
    [counts, hide, markAllRead, markRead, markUnread, state.notifications],
  );

  return (
    <NotificationSessionContext.Provider value={value}>
      {children}
    </NotificationSessionContext.Provider>
  );
}

export const useNotificationSession = (): NotificationSessionContextValue => {
  const value = useContext(NotificationSessionContext);
  if (value === null) {
    throw new Error(
      "useNotificationSession must be used inside NotificationSessionProvider",
    );
  }
  return value;
};

export const useOptionalNotificationSession = () =>
  useContext(NotificationSessionContext);

export const initialNotificationUnreadCount = notificationUnreadCounts(
  createNotificationState(),
).total;

export const notificationCategoryLabel = (
  category: NotificationCategoryId,
): string =>
  notificationCategories.find(({ id }) => id === category)?.label ?? category;
