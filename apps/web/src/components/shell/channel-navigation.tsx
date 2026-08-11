import Link from "next/link";

import { UnavailableAction } from "./unavailable-action";

const unavailableChannels = ["视频", "基金", "达人", "私募", "ETF"] as const;

export type ActiveChannel =
  "briefing" | "community" | "home" | "news" | "watchlist";

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
      <Link
        aria-current={activeChannel === "briefing" ? "page" : undefined}
        href="/7x24"
      >
        7x24
      </Link>
      <Link
        aria-current={activeChannel === "watchlist" ? "page" : undefined}
        href="/watchlist"
      >
        自选
      </Link>
      <UnavailableAction label={unavailableChannels[0]} />
      <UnavailableAction label={unavailableChannels[1]} />
      <Link
        aria-current={activeChannel === "news" ? "page" : undefined}
        href="/news"
      >
        资讯
      </Link>
      {unavailableChannels.slice(2).map((channel) => (
        <UnavailableAction label={channel} key={channel} />
      ))}
    </nav>
  );
}
