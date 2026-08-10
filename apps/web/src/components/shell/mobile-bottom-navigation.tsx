import Link from "next/link";

import { NotificationNavigationLink } from "./notification-navigation-link";

type MobileBottomNavigationProperties = Readonly<{
  notificationsActive?: boolean;
}>;

export function MobileBottomNavigation({
  notificationsActive = false,
}: MobileBottomNavigationProperties) {
  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      <Link href="/">
        <span aria-hidden="true">⌂</span>
        <span>首页</span>
      </Link>
      <Link href="/watchlist">
        <span aria-hidden="true">☆</span>
        <span>自选</span>
      </Link>
      <Link href="/markets">
        <span aria-hidden="true">⌁</span>
        <span>行情</span>
      </Link>
      <Link href="/portfolios">
        <span aria-hidden="true">◫</span>
        <span>组合</span>
      </Link>
      <NotificationNavigationLink
        active={notificationsActive}
        variant="mobile"
      />
    </nav>
  );
}
