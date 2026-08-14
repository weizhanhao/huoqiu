import Link from "next/link";
import type { ReactNode } from "react";

import { SidebarAccount } from "../../features/account/sidebar-account";
import { loadFxSnapshot } from "../../features/real-finance/fx-rates.server";
import { loadD0Fixture, type D0FixtureLoadResult } from "../../lib/d0-fixture";
import { MarketIndexStrip } from "./market-index-strip";
import { RailHotBoard } from "./rail-hot-board";
import { RailHotFunds } from "./rail-hot-funds";
import { RailHotPosts } from "./rail-hot-posts";
import { PageState } from "../system/page-state";
import { type ActiveChannel, ChannelNavigation } from "./channel-navigation";
import {
  type ActivePrimary,
  MobileBottomNavigation,
} from "./mobile-bottom-navigation";
import { NotificationNavigationLink } from "./notification-navigation-link";
import { SiteTopbar } from "./site-topbar";
import { PublishDialog } from "../../features/publish/publish-dialog";
import { SidebarProfileLink } from "./profile-navigation-link";

type DesktopShellProperties = Readonly<{
  activeChannel?: ActiveChannel | undefined;
  activePrimary?: ActivePrimary | undefined;
  activeUtility?: "notifications" | "profile" | "settings" | undefined;
  children: ReactNode;
  fixtureResult?: D0FixtureLoadResult;
  requiresD0Fixture?: boolean;
}>;

export function DesktopShell({
  activeChannel,
  activePrimary,
  activeUtility,
  children,
  fixtureResult = loadD0Fixture(),
  requiresD0Fixture = true,
}: DesktopShellProperties) {
  const fixture = fixtureResult.status === "ready" ? fixtureResult.data : null;
  // 真实汇率：服务端读本地快照，浏览器不直连第三方。
  const fx = loadFxSnapshot();
  const notificationsActive = activeUtility === "notifications";
  const profilePageActive = activeUtility === "profile";
  const profileActive = activeUtility !== undefined;
  const settingsActive = activeUtility === "settings";
  const resolvedActivePrimary =
    activePrimary ??
    (profileActive
      ? "profile"
      : activeChannel === "watchlist"
        ? "watchlist"
        : activeChannel === undefined
          ? undefined
          : "home");

  return (
    <div
      className={`d0-app-shell${
        profileActive ? " d0-app-shell-notifications" : ""
      }`}
    >
      <SiteTopbar
        notificationsActive={notificationsActive}
        settingsActive={settingsActive}
      />

      <div className="d0-layout">
        <aside className="d0-sidebar" aria-label="用户与主导航">
          <SidebarAccount
            fallbackName={fixture?.seed_user.name ?? "火球研究员"}
          />

          <PublishDialog className="sidebar-publish">＋ 发帖</PublishDialog>

          <nav aria-label="主导航">
            <p className="sidebar-group-label">行情</p>
            <Link
              aria-current={
                resolvedActivePrimary === "home" ? "page" : undefined
              }
              href="/"
            >
              <span aria-hidden="true" className="nav-icon">
                ⌂
              </span>
              首页
            </Link>
            <Link
              aria-current={
                resolvedActivePrimary === "watchlist" ? "page" : undefined
              }
              href="/watchlist"
            >
              <span aria-hidden="true" className="nav-icon">
                ☆
              </span>
              自选
            </Link>
            <Link
              aria-current={
                resolvedActivePrimary === "markets" ? "page" : undefined
              }
              href="/markets"
            >
              <span aria-hidden="true" className="nav-icon">
                ⌁
              </span>
              行情
            </Link>
            {/*
              涨跌榜与选股器此前只有路由、导航里一个入口都没有——两页都是
              真实行情，却只能靠手输地址到达。雪球把它们摆在行情这一组里。
            */}
            <Link href="/markets/rankings">
              <span aria-hidden="true" className="nav-icon">
                ⇅
              </span>
              涨跌榜
            </Link>
            <Link href="/screener">
              <span aria-hidden="true" className="nav-icon">
                ⋔
              </span>
              选股器
            </Link>
            <Link href="/funds">
              <span aria-hidden="true" className="nav-icon">
                ◇
              </span>
              基金
            </Link>
            <Link href="/etfs">
              <span aria-hidden="true" className="nav-icon">
                ◈
              </span>
              ETF
            </Link>
            <Link href="/private-funds">
              <span aria-hidden="true" className="nav-icon">
                ♦
              </span>
              私募
            </Link>

            <p className="sidebar-group-label">我的</p>
            <Link
              aria-current={
                resolvedActivePrimary === "portfolios" ? "page" : undefined
              }
              href="/portfolios"
            >
              <span aria-hidden="true" className="nav-icon">
                ◫
              </span>
              组合
            </Link>
            {/*
              雪球顶栏的「交易」是券商对接，需要牌照与真实资金通道，做不了；
              它同样有「模拟交易」，那个能真做——价格用真实行情，盈亏照真实
              价格算，只有钱是虚拟的。这里放的是后者，并且写明是模拟。
            */}
            <Link href="/trade">
              <span aria-hidden="true" className="nav-icon">
                ⇄
              </span>
              模拟交易
            </Link>
            <SidebarProfileLink active={profilePageActive} />
            {/*
              收藏此前只是个人主页里的一个页签：得先进主页、再切页签才能看到，
              左栏一个入口都没有。收藏本身是真的（按钮、bookmarks 表都在），
              只是找不到——雪球把它摆在「我的」里。
            */}
            <Link href="/bookmarks">
              <span aria-hidden="true" className="nav-icon">
                ☆
              </span>
              收藏
            </Link>
            {/*
              创作者中心此前从站内任何地方都点不到：草稿箱、内容管理、
              数据中心全都做好了，只有直接敲地址才进得去。
            */}
            <Link href="/studio">
              <span aria-hidden="true" className="nav-icon">
                ✎
              </span>
              创作者中心
            </Link>
            <NotificationNavigationLink
              active={notificationsActive}
              variant="sidebar"
            />
            {/*
              这四条过去全部指向 /notifications，点哪条都落到默认视图——
              四个入口做同一件事，等于没做。现在各自带分类参数直达。
            */}
            <Link className="nav-sub" href="/notifications?category=replies">
              回复
            </Link>
            <Link className="nav-sub" href="/notifications?category=mentions">
              @ 我
            </Link>
            <Link className="nav-sub" href="/notifications?category=likes">
              赞与收藏
            </Link>
            <Link className="nav-sub" href="/notifications?category=system">
              系统消息
            </Link>
            {/* 私信是独立路由：它是账号之间的真实会话，不是通知流的一类。 */}
            <Link className="nav-sub" href="/messages">
              私信
            </Link>
            <Link
              aria-current={settingsActive ? "page" : undefined}
              href="/settings"
            >
              <span aria-hidden="true" className="nav-icon">
                ⚙
              </span>
              设置
            </Link>
          </nav>

          {/*
            这句话此前是「本地会话数据，刷新后重置」——而账号、帖子、评论、
            消息、资料和组合早就跟着账号落盘了。对着一个刚改完资料的人说
            「刷新后重置」，是在让他白改一遍。真正只活在本次会话里的
            只剩自选清单。
          */}
          <p className="session-disclosure">
            自选刷新后重置；账号、帖子与组合跟随账号保存
          </p>
        </aside>

        <main className="d0-main">
          <MarketIndexStrip />
          {/*
            频道栏在所有页面都渲染，包括消息 / 设置 / 我的。
            之前这三页把它整个摘掉，主列内容的起始位置就比别处高 52px——
            从任意页面点进这三页，内容会整体上跳一下，跳完还"恢复正常"，
            正是那种说不出哪里不对的劣质感。导航条的存在与否不该随页面变。
          */}
          <ChannelNavigation activeChannel={activeChannel} />
          {!requiresD0Fixture || fixtureResult.status === "ready" ? (
            children
          ) : (
            <PageState state="error" errorMessage={fixtureResult.message} />
          )}
        </main>

        <aside className="d0-rail" aria-label="社区行情与热榜">
          <RailHotBoard />

          {/*
            这一块过去列的是站内那六只写死的基金（fund_syn_000x），
            名字和收益都是编的。现在按近一年收益从公开排行里取，
            每一行都通向它自己的真实详情页。
          */}
          <RailHotFunds />

          {/*
            热榜过去排的是十条写死的合成帖子（post_syn_…），标题和互动量都是
            编的，站内真实发出来的帖子一条也上不了榜。现在按真实点赞数排
            真实帖子——榜单和内容终于是同一批东西。
          */}
          <RailHotPosts />

          <section className="rail-card" aria-labelledby="rail-fx-heading">
            <div className="rail-heading">
              <h2 id="rail-fx-heading">外汇</h2>
              <span>{fx === null ? "暂无数据" : "真实数据"}</span>
            </div>
            {fx === null ? (
              <p className="rail-empty">
                尚未生成汇率快照，不使用合成数据补位。
              </p>
            ) : (
              <>
                {fx.rates.slice(0, 6).map((rate) => (
                  <div className="fund-row" key={rate.code}>
                    <span>
                      <strong>
                        {rate.label} {rate.code}
                      </strong>
                      <small>
                        1 {fx.base} = {rate.rate}
                      </small>
                    </span>
                    <strong
                      className={
                        rate.changePct === null
                          ? undefined
                          : rate.changePct >= 0
                            ? "market-up"
                            : "market-down"
                      }
                    >
                      {rate.changePct === null
                        ? "—"
                        : `${rate.changePct >= 0 ? "+" : ""}${rate.changePct.toFixed(2)}%`}
                    </strong>
                  </div>
                ))}
                <p className="rail-source">
                  {fx.source} · {fx.date}
                </p>
              </>
            )}
          </section>

          {/*
            「市场快照」那一块删掉了。
            它列的是虚构标的（星海智造 SYN001…），涨跌色和正号还是写死的
            ——不管数字是正是负一律显示成上涨。真实的市场概览在正文上方的
            指数条里，那三张卡是沪深三大指数的实时行情。
          */}

          <p className="rail-disclosure">
            行情数据来自公开接口 · 不构成投资建议
          </p>
        </aside>
      </div>
      {/*
        移动端发布入口。侧栏在 ≤720px 被隐藏，底栏五格也放不下发布，
        所以这里给一个浮动按钮——否则手机上只能看不能发。
        桌面端由 CSS 隐藏（.mobile-publish-fab 默认 display: none）。
      */}
      <PublishDialog className="mobile-publish-fab" label="发帖">
        <span aria-hidden="true">＋</span>
      </PublishDialog>

      <MobileBottomNavigation activePrimary={resolvedActivePrimary} />
    </div>
  );
}
