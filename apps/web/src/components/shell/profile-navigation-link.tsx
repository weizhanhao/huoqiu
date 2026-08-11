"use client";

import Link from "next/link";

import { NotificationUnreadBadge } from "./notification-navigation-link";

type ProfileNavigationLinkProperties = Readonly<{
  active?: boolean;
}>;

export function ProfileNavigationLink({
  active = false,
}: ProfileNavigationLinkProperties) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className="profile-navigation-link"
      href="/users/user_demo_0001"
    >
      <span aria-hidden="true">◉</span>
      <span>我的</span>
      <NotificationUnreadBadge />
    </Link>
  );
}
