"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  notificationCategories,
  syntheticNotifications,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-fixtures";

export {
  notificationCategories,
  syntheticNotifications,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-fixtures";

export type NotificationState = Readonly<{
  hiddenIds: readonly string[];
  notifications: readonly SyntheticNotification[];
}>;

export type NotificationAction =
  | Readonly<{ id: string; type: "hide" }>
  | Readonly<{ id: string; type: "mark-read" }>
  | Readonly<{ id: string; type: "mark-unread" }>
  | Readonly<{ type: "mark-all-read" }>;

export type NotificationUnreadCounts = Readonly<{
  byCategory: Readonly<Record<NotificationCategoryId, number>>;
  total: number;
}>;

export const createNotificationState = (
  initialNotifications: readonly SyntheticNotification[] = syntheticNotifications,
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
  const byCategory: Record<NotificationCategoryId, number> = {
    likes: 0,
    mentions: 0,
    replies: 0,
    system: 0,
  };
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
  initialNotifications = syntheticNotifications,
}: NotificationSessionProviderProperties) {
  const [state, dispatch] = useReducer(
    notificationReducer,
    initialNotifications,
    createNotificationState,
  );
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
