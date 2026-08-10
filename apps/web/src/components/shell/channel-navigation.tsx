import Link from "next/link";

import { UnavailableAction } from "./unavailable-action";

const unavailableChannels = [
  "7x24",
  "视频",
  "基金",
  "资讯",
  "达人",
  "私募",
  "ETF",
] as const;

export type ActiveChannel = "community" | "home" | "watchlist";

type ChannelNavigationProperties = Readonly<{
  activeChannel?: ActiveChannel | undefined;
}>;

export function ChannelNavigation({
  activeChannel,
}: ChannelNavigationProperties) {
  return (
    <nav className="channel-tabs" aria-label="全局频道">
      <Link
        aria-current={activeChannel === "home" ? "page" : undefined}
        href="/"
      >
        首页
      </Link>
      <UnavailableAction label="关注" />
      <Link
        aria-current={activeChannel === "community" ? "page" : undefined}
        href="/community"
      >
        热门
      </Link>
      <UnavailableAction label="7x24" />
      <Link
        aria-current={activeChannel === "watchlist" ? "page" : undefined}
        href="/watchlist"
      >
        自选
      </Link>
      {unavailableChannels.slice(1).map((channel) => (
        <UnavailableAction label={channel} key={channel} />
      ))}
    </nav>
  );
}
