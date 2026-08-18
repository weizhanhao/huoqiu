import Link from "next/link";
import type { ReactNode } from "react";

import { HomeSidebarNavigation } from "./home-sidebar-navigation";
import { XueqiuSidebarAccount } from "./xueqiu-sidebar-account";
import { MobileBottomNavigation } from "../shell/mobile-bottom-navigation";
import { NotificationNavigationLink } from "../shell/notification-navigation-link";
import { RailHotBoard } from "../shell/rail-hot-board";
import { RailHotFunds } from "../shell/rail-hot-funds";
import { RailHotPosts } from "../shell/rail-hot-posts";
import { ShellHeader } from "../shell/shell-header";
import { ShellIcon } from "../shell/shell-icons";
import { SidebarPublishControl } from "../shell/sidebar-publish-control";

/**
 * 雪球首页专用壳。
 *
 * 同事提交后的 DesktopShell 继续服务行情、基金、消息等功能页；首页使用这套
 * 上周已经完成的 DOM 结构，使 xueqiu-theme.css 的选择器真正重新生效。
 */
export function XueqiuHomeShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="d0-app-shell xueqiu-home-shell">
      <ShellHeader />

      <div className="d0-layout">
        <aside className="d0-sidebar" aria-label="用户与主导航">
          <XueqiuSidebarAccount />
          <SidebarPublishControl />

          <nav aria-label="主导航">
            <HomeSidebarNavigation />
            <Link href="/markets">
              <ShellIcon name="market" />
              <span>行情</span>
            </Link>
            <Link href="/funds">
              <ShellIcon name="portfolio" />
              <span>基金</span>
            </Link>
            <Link href="/private-funds">
              <ShellIcon name="watchlist" />
              <span>私募</span>
            </Link>
            <Link href="/portfolios">
              <ShellIcon name="portfolio" />
              <span>我的资产</span>
            </Link>
            <Link href="/creators">
              <ShellIcon name="publish" />
              <span>创作者中心</span>
            </Link>
            <NotificationNavigationLink variant="sidebar" />
            <div className="sidebar-message-links">
              <Link href="/notifications?type=replies">回复</Link>
              <Link href="/notifications?type=mentions">@我</Link>
              <Link href="/notifications?type=likes">赞</Link>
              <Link href="/notifications?type=followers">我的粉丝</Link>
              <Link href="/notifications?type=system">系统消息</Link>
              <Link href="/messages">私信</Link>
            </div>
          </nav>
        </aside>

        <main className="d0-main">{children}</main>

        <aside className="d0-rail" aria-label="社区行情与热榜">
          <RailHotPosts />
          <RailHotBoard />
          <RailHotFunds />
        </aside>
      </div>

      <MobileBottomNavigation />
    </div>
  );
}
