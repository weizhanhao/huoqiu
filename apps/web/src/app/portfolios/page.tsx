import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { AccountPortfolios } from "../../features/market-portfolio/account-portfolios";
import { PortfolioLeaderboard } from "../../features/market-portfolio/portfolio-leaderboard";

export const metadata: Metadata = {
  description: "组合榜单、收益概况与新建组合",
  title: "组合 · 火球",
};

export default function PortfoliosPage() {
  return (
    <DesktopShell>
      {/*
        跟随账号保存的组合放在最前面：那是「我的东西」，
        下面的榜单是所有人的。此前组合只活在本次会话里，刷新就没了。
      */}
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">组合</h1>
      <AccountPortfolios />
      {/*
        榜单此前列的是十二条写死的样本组合，站内真实存在的一条也不在上面。
        现在列的就是本站账号建过的组合，收益按真实行情加权算。
      */}
      <PortfolioLeaderboard />
    </DesktopShell>
  );
}
