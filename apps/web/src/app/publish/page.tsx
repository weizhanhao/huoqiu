import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { Publisher } from "../../features/community/community-experience";

export const metadata: Metadata = {
  description: "写讨论或长文，登录后发布会保存到你的主页",
  title: "发布 · 火球",
};

export default function PublishPage() {
  return (
    <DesktopShell>
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">写帖子</h1>
      <Publisher />
    </DesktopShell>
  );
}
