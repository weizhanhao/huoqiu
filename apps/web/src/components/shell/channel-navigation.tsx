"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref } from "./active-nav";

/**
 * 全局频道栏。
 *
 * 12 个频道全部指向真实路由，不再有占位项。
 *
 * 当前项由地址决定，不由页面传参。原先 /community/[channel] 这一条路由
 * 写死了——不管点进哪个频道，点亮的都是「热门」。
 * 用户点「关注」，页签却跳到「热门」上，正是这么来的。
 */
export type ActiveChannel =
  | "briefing"
  | "community"
  | "creators"
  | "etfs"
  | "follow"
  | "funds"
  | "news"
  | "privateFunds"
  | "topics"
  | "videos"
  | "watchlist";

type Channel = Readonly<{ href: string; id: ActiveChannel; label: string }>;

const channels: readonly Channel[] = [
  /*
   * 没有「首页」这一档：根路径就是关注流。
   * 原先首页与关注是两个页签，而首页塞的是编辑部栏目 + 财经区块，
   * 和「关注」各讲各的，用户进站第一眼看到的不是他关注的人。
   */
  { href: "/", id: "follow", label: "关注" },
  { href: "/community", id: "community", label: "热门" },
  { href: "/7x24", id: "briefing", label: "7x24" },
  { href: "/watchlist", id: "watchlist", label: "自选" },
  { href: "/videos", id: "videos", label: "视频" },
  { href: "/funds", id: "funds", label: "基金" },
  { href: "/news", id: "news", label: "资讯" },
  { href: "/creators", id: "creators", label: "达人" },
  { href: "/private-funds", id: "privateFunds", label: "私募" },
  { href: "/etfs", id: "etfs", label: "ETF" },
  /*
   * 话题此前只有 /topics/[tag] 这一层，全站没有任何地方链到它——
   * 发布器能插入 #话题#，插完却没有入口能找回来。
   */
  { href: "/topics", id: "topics", label: "话题" },
];

const CHANNEL_HREFS = channels.map((channel) => channel.href);

export function ChannelNavigation() {
  /*
   * /community 与 /community/follow 都会匹配到，取最长的那条——
   * 否则站在关注页上点亮的是热门。没有路由上下文时返回 null（静态渲染、
   * 测试里单独渲染都是）。
   */
  const pathname = usePathname() ?? "";
  const active = activeNavHref(
    pathname === "/portfolios" || pathname.startsWith("/portfolios/")
      ? "/watchlist"
      : pathname,
    CHANNEL_HREFS,
  );

  return (
    <nav className="channel-tabs" aria-label="全局频道">
      {channels.map((channel) => (
        <Link
          aria-current={active === channel.href ? "page" : undefined}
          href={channel.href}
          key={channel.id}
        >
          {channel.label}
        </Link>
      ))}
    </nav>
  );
}
