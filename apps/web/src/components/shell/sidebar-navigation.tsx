"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { activeNavHref } from "./active-nav";
import { NotificationNavigationLink } from "./notification-navigation-link";
import { SidebarProfileLink } from "./profile-navigation-link";

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
  /** 链接地址；由专门组件渲染的项没有，它们自己算（见 kind）。 */
  href?: string;
  icon: string;
  /** 消息有未读角标、我的主页地址随登录状态变，各自由专门的组件渲染。 */
  kind?: "notifications" | "profile";
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
      { href: "/", icon: "⌂", label: "首页", match: "/" },
      { href: "/watchlist", icon: "☆", label: "自选", match: "/watchlist" },
      { href: "/markets", icon: "⌁", label: "行情", match: "/markets" },
      /*
        涨跌榜与选股器此前只有路由、导航里一个入口都没有——两页都是真实
        行情，却只能靠手输地址到达。雪球把它们摆在行情这一组里。
      */
      {
        href: "/markets/rankings",
        icon: "⇅",
        label: "涨跌榜",
        match: "/markets/rankings",
      },
      { href: "/screener", icon: "⋔", label: "选股器", match: "/screener" },
      { href: "/funds", icon: "◇", label: "基金", match: "/funds" },
      { href: "/etfs", icon: "◈", label: "ETF", match: "/etfs" },
      {
        href: "/private-funds",
        icon: "♦",
        label: "私募",
        match: "/private-funds",
      },
    ],
    title: "行情",
  },
  {
    items: [
      { href: "/portfolios", icon: "◫", label: "组合", match: "/portfolios" },
      /*
        雪球顶栏的「交易」是券商对接，需要牌照与真实资金通道，做不了；
        它同样有「模拟交易」，那个能真做——价格用真实行情，盈亏照真实价格
        算，只有钱是虚拟的。这里放的是后者，并且写明是模拟。
      */
      { href: "/trade", icon: "⇄", label: "模拟交易", match: "/trade" },
      { icon: "◉", kind: "profile", label: "我的主页", match: "/users" },
      /*
        收藏此前只是个人主页里的一个页签：得先进主页、再切页签才能看到，
        左栏一个入口都没有。收藏本身是真的，只是找不到。
      */
      { href: "/bookmarks", icon: "☆", label: "收藏", match: "/bookmarks" },
      /*
        创作者中心此前从站内任何地方都点不到：草稿箱、内容管理、数据中心
        全都做好了，只有直接敲地址才进得去。
      */
      { href: "/studio", icon: "✎", label: "创作者中心", match: "/studio" },
      {
        href: "/notifications",
        icon: "✉",
        kind: "notifications",
        label: "消息",
        match: "/notifications",
      },
      { href: "/settings", icon: "⚙", label: "设置", match: "/settings" },
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
const NOTIFICATION_SUBS: readonly Readonly<{ href: string; label: string }>[] =
  [
    { href: "/notifications?category=replies", label: "回复" },
    { href: "/notifications?category=mentions", label: "@ 我" },
    { href: "/notifications?category=likes", label: "赞与收藏" },
    { href: "/notifications?category=system", label: "系统消息" },
    /* 私信是独立路由：它是账号之间的真实会话，不是通知流的一类。 */
    { href: "/messages", label: "私信" },
  ];

const ALL_MATCHES = [
  ...GROUPS.flatMap((group) => group.items.map((item) => item.match)),
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
            const current = active === item.match;
            if (item.kind === "notifications") {
              return (
                <NotificationNavigationLink
                  active={current}
                  key={item.match}
                  variant="sidebar"
                />
              );
            }
            if (item.kind === "profile") {
              return <SidebarProfileLink active={current} key={item.match} />;
            }
            return (
              <Link
                aria-current={current ? "page" : undefined}
                href={item.href ?? item.match}
                key={item.match}
              >
                <span aria-hidden="true" className="nav-icon">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
          {group.title === "我的"
            ? NOTIFICATION_SUBS.map((sub) => (
                <Link className="nav-sub" href={sub.href} key={sub.href}>
                  {sub.label}
                </Link>
              ))
            : null}
        </Fragment>
      ))}
    </nav>
  );
}
