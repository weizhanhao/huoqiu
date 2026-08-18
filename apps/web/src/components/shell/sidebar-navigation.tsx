"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { activeNavHref } from "./active-nav";
import { NotificationNavigationLink } from "./notification-navigation-link";
import { ShellIcon, type ShellIconName } from "./shell-icons";

/*
 * 侧栏主导航。
 *
 * 选中态从当前地址推，不再由各页传参数。原先 /markets/rankings 传的是
 * "markets"，人站在涨跌榜上，点亮的却是「行情」；涨跌榜、选股器、基金、
 * ETF、私募、模拟交易、收藏、创作者中心这些更是一个选中态都没有——传参
 * 这件事页面很容易忘、也很容易传错，而错了只表现为「高亮在别处」，
 * 不报任何错。
 *
 * 导航项写成数据，而不是十四段各自带判断的 JSX：判定只有一处，加一条新
 * 入口也不必再想「选中态怎么接」。
 */

type NavItem = Readonly<{
  alsoMatches?: readonly string[];
  /** 链接地址；由专门组件渲染的项没有，它们自己算（见 kind）。 */
  href?: string;
  icon: ShellIconName;
  /** 消息有未读角标、我的主页地址随登录状态变，各自由专门的组件渲染。 */
  kind?: "notifications";
  label: string;
  /*
   * 用来判断「当前是否停在这一项」的路径前缀。
   *
   * 多数项就是 href 本身。「我的主页」是例外：它的地址随登录状态在
   * /login 与 /users/<id> 之间变，而站内并没有 /users 这一页——所以这里
   * 只把它当匹配前缀，不当链接，否则就是一条指向 404 的死链。
   */
  match: string;
}>;

type NavGroup = Readonly<{ items: readonly NavItem[]; title: string }>;

const GROUPS: readonly NavGroup[] = [
  {
    items: [
      /* 根路径是关注流，站内没有「首页」这一档。 */
      { href: "/", icon: "home", label: "首页", match: "/" },
      {
        href: "/watchlist",
        icon: "watchlist",
        label: "自选",
        match: "/watchlist",
      },
      {
        alsoMatches: ["/markets/rankings", "/screener"],
        href: "/markets",
        icon: "market",
        label: "行情",
        match: "/markets",
      },
      {
        alsoMatches: ["/etfs"],
        href: "/funds",
        icon: "fund",
        label: "基金",
        match: "/funds",
      },
      {
        href: "/private-funds",
        icon: "private",
        label: "私募",
        match: "/private-funds",
      },
    ],
    title: "行情",
  },
  {
    items: [
      {
        alsoMatches: ["/trade"],
        href: "/portfolios",
        icon: "portfolio",
        label: "我的资产",
        match: "/portfolios",
      },
      {
        href: "/studio",
        icon: "studio",
        label: "创作者中心",
        match: "/studio",
      },
      {
        href: "/notifications",
        icon: "support",
        kind: "notifications",
        label: "消息",
        match: "/notifications",
      },
    ],
    title: "我的",
  },
];

/*
 * 消息底下的分类。
 *
 * 这四条过去全部指向 /notifications，点哪条都落到默认视图——四个入口做同
 * 一件事，等于没做。现在各自带分类参数直达；选中态跟着父项「消息」走。
 */
const ALL_MATCHES = [
  ...GROUPS.flatMap((group) =>
    group.items.flatMap((item) => [item.match, ...(item.alsoMatches ?? [])]),
  ),
  "/messages",
];

export function SidebarNavigation() {
  /* 没有路由上下文时返回 null（静态渲染、测试里单独渲染都是）。 */
  const pathname = usePathname() ?? "";
  const active = activeNavHref(pathname, ALL_MATCHES);

  return (
    <nav aria-label="主导航">
      {/*
        用 Fragment 而不是包一层 div：.d0-sidebar nav 是 grid，网格项就是这些
        链接本身。套一层 div 会让整组变成一个网格项，行距塌掉、宽度也撑开，
        窄屏下直接横向溢出。
      */}
      {GROUPS.map((group) => (
        <Fragment key={group.title}>
          <p className="sidebar-group-label">{group.title}</p>
          {group.items.map((item) => {
            const current =
              active !== null &&
              (active === item.match ||
                (item.alsoMatches?.includes(active) ?? false));
            if (item.kind === "notifications") {
              return (
                <NotificationNavigationLink
                  active={current}
                  key={item.match}
                  variant="sidebar"
                />
              );
            }
            return (
              <Link
                aria-current={current ? "page" : undefined}
                href={item.href ?? item.match}
                key={item.match}
              >
                <ShellIcon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
