import type { Metadata } from "next";

import { DesktopShell } from "../components/shell/desktop-shell";
import { FollowFeed } from "../features/community/follow-feed";
import { PostComposer } from "../features/publish/post-composer";

/*
 * 首页就是关注流。
 *
 * 站内此前把「首页」和「关注」做成两个页签：首页塞的是编辑部栏目卡、夹具
 * 信息流和财经区块，关注反而在另一页。进站第一眼看到的不是自己关注的人，
 * 而是一堆和自己无关的东西。
 *
 * 现在这一页只有两样：写点什么，和关注的人写了什么。财经资讯在「资讯」页签，
 * 行情在「行情」，各归各位。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "你关注的人发布的内容",
  title: "关注 · 火球",
};

export default function HomePage() {
  return (
    <DesktopShell requiresD0Fixture={false}>
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">关注</h1>
      {/*
        顶部直接能发。此前发帖只在顶栏那个入口里，想说一句话得先找到它。
        未登录时这一块会自己变成一句登录提示，不占着一个点不动的框。
      */}
      <PostComposer variant="inline" />
      <FollowFeed />
    </DesktopShell>
  );
}
