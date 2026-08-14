"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref } from "./active-nav";
import { ProfileNavigationLink } from "./profile-navigation-link";

/*
 * 移动端底栏。
 *
 * 选中态和侧栏一样从地址推，不再由各页传 activePrimary——那个参数页面很容易
 * 忘或传错，而错了只表现为「高亮在别处」，不报任何错。两处各判一次的话，
 * 迟早出现「电脑上亮对了、手机上亮错了」。
 */

const ITEMS: readonly Readonly<{
  href?: string;
  icon: string;
  label: string;
  /*
   * 可以有多个前缀。
   *
   * 底栏只有五格，消息、设置、个人主页都归在「我的」这一格下——各占一格
   * 的话行情类入口就得让位。所以停在这几页时点亮的都是「我的」。
   * 它的地址本身还随登录状态在 /login 与 /users/<id> 之间变，因此这里
   * 只当匹配前缀用，链接由 ProfileNavigationLink 自己算。
   */
  match: readonly string[];
}>[] = [
  { href: "/", icon: "⌂", label: "首页", match: ["/"] },
  { href: "/watchlist", icon: "☆", label: "自选", match: ["/watchlist"] },
  { href: "/markets", icon: "⌁", label: "行情", match: ["/markets"] },
  { href: "/portfolios", icon: "◫", label: "组合", match: ["/portfolios"] },
  {
    icon: "◉",
    label: "我的",
    match: ["/users", "/login", "/notifications", "/messages", "/settings"],
  },
];

const MATCHES = ITEMS.flatMap((item) => item.match);

export function MobileBottomNavigation() {
  /* 没有路由上下文时返回 null（静态渲染、测试里单独渲染都是）。 */
  const active = activeNavHref(usePathname() ?? "", MATCHES);

  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      {ITEMS.map((item) => {
        const current = active !== null && item.match.includes(active);
        if (item.href === undefined) {
          return <ProfileNavigationLink active={current} key={item.label} />;
        }
        return (
          <Link
            aria-current={current ? "page" : undefined}
            href={item.href}
            key={item.label}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
