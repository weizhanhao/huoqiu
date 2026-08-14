import Link from "next/link";

/**
 * 全局频道栏。
 *
 * `yaoqiu.md` 要求每个按钮必须真实可操作，或明确标注暂未开放。
 * 这里 11 个频道全部指向真实路由，不再有占位项。
 */
export type ActiveChannel =
  | "briefing"
  | "community"
  | "creators"
  | "etfs"
  | "follow"
  | "funds"
  | "home"
  | "news"
  | "privateFunds"
  | "topics"
  | "videos"
  | "watchlist";

type Channel = Readonly<{ href: string; id: ActiveChannel; label: string }>;

const channels: readonly Channel[] = [
  { href: "/", id: "home", label: "首页" },
  { href: "/community/follow", id: "follow", label: "关注" },
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

type ChannelNavigationProperties = Readonly<{
  activeChannel?: ActiveChannel | undefined;
}>;

export function ChannelNavigation({
  activeChannel,
}: ChannelNavigationProperties) {
  return (
    <nav className="channel-tabs" aria-label="全局频道">
      {channels.map((channel) => (
        <Link
          aria-current={activeChannel === channel.id ? "page" : undefined}
          href={channel.href}
          key={channel.id}
        >
          {channel.label}
        </Link>
      ))}
    </nav>
  );
}
