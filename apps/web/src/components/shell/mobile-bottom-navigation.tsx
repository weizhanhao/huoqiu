import Link from "next/link";

import { UnavailableAction } from "./unavailable-action";

export function MobileBottomNavigation() {
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
      <UnavailableAction icon="⌁" label="行情" />
      <UnavailableAction icon="◫" label="组合" />
      <UnavailableAction icon="○" label="我的" />
    </nav>
  );
}
