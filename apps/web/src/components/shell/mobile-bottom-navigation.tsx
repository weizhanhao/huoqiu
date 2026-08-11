import Link from "next/link";

import { ProfileNavigationLink } from "./profile-navigation-link";

export type ActivePrimary =
  "home" | "markets" | "portfolios" | "profile" | "watchlist";

type MobileBottomNavigationProperties = Readonly<{
  activePrimary?: ActivePrimary | undefined;
}>;

export function MobileBottomNavigation({
  activePrimary,
}: MobileBottomNavigationProperties) {
  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      <Link
        aria-current={activePrimary === "home" ? "page" : undefined}
        href="/"
      >
        <span aria-hidden="true">⌂</span>
        <span>首页</span>
      </Link>
      <Link
        aria-current={activePrimary === "watchlist" ? "page" : undefined}
        href="/watchlist"
      >
        <span aria-hidden="true">☆</span>
        <span>自选</span>
      </Link>
      <Link
        aria-current={activePrimary === "markets" ? "page" : undefined}
        href="/markets"
      >
        <span aria-hidden="true">⌁</span>
        <span>行情</span>
      </Link>
      <Link
        aria-current={activePrimary === "portfolios" ? "page" : undefined}
        href="/portfolios"
      >
        <span aria-hidden="true">◫</span>
        <span>组合</span>
      </Link>
      <ProfileNavigationLink active={activePrimary === "profile"} />
    </nav>
  );
}
