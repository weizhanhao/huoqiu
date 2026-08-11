"use client";

import Link from "next/link";

import {
  initialNotificationUnreadCount,
  useOptionalNotificationSession,
} from "../../features/notifications/notification-state";

type NotificationNavigationLinkProperties = Readonly<{
  active?: boolean;
  variant: "mobile" | "sidebar" | "top";
}>;

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6.7 9.3a5.3 5.3 0 0 1 10.6 0c0 5 2.1 5.7 2.1 5.7H4.6s2.1-.7 2.1-5.7Z" />
      <path d="M9.8 18a2.4 2.4 0 0 0 4.4 0" />
    </svg>
  );
}

export function NotificationNavigationLink({
  active = false,
  variant,
}: NotificationNavigationLinkProperties) {
  const className = `notification-nav-link notification-nav-link-${variant}`;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={className}
      href="/notifications"
    >
      <span className="notification-nav-icon">
        <BellIcon />
      </span>
      <span>消息</span>
      <NotificationUnreadBadge />
    </Link>
  );
}

export function NotificationUnreadBadge() {
  const session = useOptionalNotificationSession();
  const unreadCount = session?.counts.total ?? initialNotificationUnreadCount;

  return unreadCount > 0 ? (
    <span
      aria-label={`${unreadCount} 条未读通知`}
      className="notification-nav-badge"
    >
      <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
    </span>
  ) : null;
}
