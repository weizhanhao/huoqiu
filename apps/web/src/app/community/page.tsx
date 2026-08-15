import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { CommunityFeed } from "../../features/community/community-experience";

export const metadata: Metadata = {
  description: "栏目记录与用户发布的观察笔记",
  title: "社区 · 火球",
};

export default function CommunityPage() {
  return (
    <DesktopShell>
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">社区</h1>
      <CommunityFeed />
    </DesktopShell>
  );
}
