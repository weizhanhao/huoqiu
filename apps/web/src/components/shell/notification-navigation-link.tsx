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
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M9.6 20a2.8 2.8 0 0 0 4.8 0" />
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
      aria-label="消息"
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
