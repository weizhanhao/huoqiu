"use client";

import Link from "next/link";

import { ShellIcon } from "../shell/shell-icons";
import { useOptionalHomeView, type HomeView } from "./home-view-context";

const navigationItems = [
  { href: "/", icon: "home", label: "首页", view: "feed" },
  {
    href: "/watchlist",
    icon: "watchlist",
    label: "自选",
    view: "watchlist",
  },
] as const;

export function HomeSidebarNavigation() {
  const homeView = useOptionalHomeView();
  const activeView = homeView?.view ?? "feed";

  return navigationItems.map((item) => (
    <Link
      aria-current={activeView === item.view ? "page" : undefined}
      href={item.href}
      key={item.view}
      onClick={(event) => {
        if (!homeView) return;
        event.preventDefault();
        homeView.setView(item.view as HomeView);
      }}
    >
      <ShellIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  ));
}
