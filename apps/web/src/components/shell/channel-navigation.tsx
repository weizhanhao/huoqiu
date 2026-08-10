import Link from "next/link";

import { UnavailableAction } from "./unavailable-action";

const unavailableChannels = [
  "关注",
  "热门",
  "7x24",
  "视频",
  "基金",
  "资讯",
  "达人",
  "私募",
  "ETF",
] as const;

export function ChannelNavigation() {
  return (
    <nav className="channel-tabs" aria-label="全局频道">
      <Link href="/">首页</Link>
      {unavailableChannels.slice(0, 3).map((channel) => (
        <UnavailableAction label={channel} key={channel} />
      ))}
      <Link href="/watchlist">自选</Link>
      {unavailableChannels.slice(3).map((channel) => (
        <UnavailableAction label={channel} key={channel} />
      ))}
    </nav>
  );
}
