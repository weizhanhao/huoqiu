import type { Metadata } from "next";

import { DesktopShell } from "../components/shell/desktop-shell";
import { FollowFeed } from "../features/community/follow-feed";
import { PostComposer } from "../features/publish/post-composer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "你关注的人发布的内容",
  title: "关注 · 火球",
};

export default function HomePage() {
  return (
    <DesktopShell requiresD0Fixture={false}>
      <h1 className="visually-hidden">关注</h1>
      <PostComposer variant="inline" />
      <FollowFeed />
    </DesktopShell>
  );
}
