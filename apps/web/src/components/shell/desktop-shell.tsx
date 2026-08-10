import Link from "next/link";
import type { ReactNode } from "react";

import { loadD0Fixture, type D0FixtureLoadResult } from "../../lib/d0-fixture";
import { DemoDataBadge } from "../system/demo-data-badge";
import { PageState } from "../system/page-state";
import { type ActiveChannel, ChannelNavigation } from "./channel-navigation";
import { MobileBottomNavigation } from "./mobile-bottom-navigation";
import { NotificationNavigationLink } from "./notification-navigation-link";
import { UnavailableAction } from "./unavailable-action";

type DesktopShellProperties = Readonly<{
  activeChannel?: ActiveChannel | undefined;
  activeUtility?: "notifications" | undefined;
  children: ReactNode;
  fixtureResult?: D0FixtureLoadResult;
}>;

export function DesktopShell({
  activeChannel,
  activeUtility,
  children,
  fixtureResult = loadD0Fixture(),
}: DesktopShellProperties) {
  const fixture = fixtureResult.status === "ready" ? fixtureResult.data : null;
  const notificationsActive = activeUtility === "notifications";

  return (
    <div
      className={`d0-app-shell${
        notificationsActive ? " d0-app-shell-notifications" : ""
      }`}
    >
      <header className="d0-topbar">
        <Link className="d0-brand" href="/" aria-label="火球首页">
          <span className="brand-mark" aria-hidden="true">
            火
          </span>
          <h1>火球</h1>
        </Link>
        <form className="global-search" action="/search" method="get">
          <label className="visually-hidden" htmlFor="global-search-query">
            搜索标的
          </label>
          <input
            id="global-search-query"
            name="q"
            type="search"
            placeholder="搜索代码、名称、拼音或别名"
          />
          <button type="submit">搜索</button>
        </form>
        <nav className="top-actions" aria-label="顶部功能">
          <NotificationNavigationLink
            active={notificationsActive}
            variant="top"
          />
          <Link className="top-action-link" href="/publish">
            <span className="unavailable-icon" aria-hidden="true">
              ＋
            </span>
            <span>发布</span>
          </Link>
          <UnavailableAction icon="⚙" label="设置" />
        </nav>
        <DemoDataBadge />
      </header>

      <div className="d0-layout">
        <aside className="d0-sidebar" aria-label="用户与主导航">
          <div className="seed-user">
            <span className="seed-avatar" aria-hidden="true">
              演
            </span>
            <div>
              <strong>{fixture?.seed_user.name ?? "演示用户"}</strong>
              <small>固定 Fixture 身份</small>
            </div>
          </div>
          <Link className="sidebar-publish" href="/publish">
            ＋ 写帖子
          </Link>
          <nav aria-label="主导航">
            <Link href="/">首页</Link>
            <Link href="/watchlist">自选</Link>
            <Link href="/markets">行情</Link>
            <Link href="/portfolios">组合</Link>
            <NotificationNavigationLink
              active={notificationsActive}
              variant="sidebar"
            />
          </nav>
          <p className="session-disclosure">仅本机演示，不会跨端同步</p>
        </aside>

        <main className="d0-main">
          {notificationsActive ? null : (
            <ChannelNavigation activeChannel={activeChannel} />
          )}
          {fixtureResult.status === "ready" ? (
            children
          ) : (
            <PageState state="error" errorMessage={fixtureResult.message} />
          )}
        </main>

        <aside className="d0-rail" aria-label="社区行情与热榜">
          <section className="rail-card">
            <div className="rail-heading">
              <h2>演示行情</h2>
              <span>固定快照</span>
            </div>
            {fixture?.instruments.map((instrument) => {
              const quote = fixture.quotes.find(
                (candidate) => candidate.listing_id === instrument.listing_id,
              );
              return (
                <Link
                  className="rail-quote"
                  href={`/instruments/${instrument.listing_id}`}
                  key={instrument.listing_id}
                >
                  <span>
                    <strong>{instrument.name}</strong>
                    <small>{instrument.symbol}</small>
                  </span>
                  <span className="market-up">
                    {quote?.last ?? "--"}
                    <small>+{quote?.change_pct ?? "--"}%</small>
                  </span>
                </Link>
              );
            })}
          </section>

          <section className="rail-card">
            <div className="rail-heading">
              <h2>社区热榜</h2>
              <span>演示</span>
            </div>
            <ol className="hot-list">
              <li>
                <span>01</span>
                <strong>合成市场午后观察</strong>
              </li>
              <li>
                <span>02</span>
                <strong>波动中的长期视角</strong>
              </li>
              <li>
                <span>03</span>
                <strong>读懂公开市场数据</strong>
              </li>
            </ol>
          </section>

          <section className="rail-card">
            <div className="rail-heading">
              <h2>热门基金</h2>
              <span>合成排行</span>
            </div>
            <div className="fund-row">
              <span>
                <strong>合成成长基金 A</strong>
                <small>演示基金</small>
              </span>
              <strong className="market-up">+1.28%</strong>
            </div>
            <div className="fund-row">
              <span>
                <strong>合成稳健基金 B</strong>
                <small>演示基金</small>
              </span>
              <strong className="market-down">-0.42%</strong>
            </div>
          </section>
          <p className="rail-disclosure">
            演示数据 / 合成数据 · 不构成投资建议
          </p>
        </aside>
      </div>
      <MobileBottomNavigation notificationsActive={notificationsActive} />
    </div>
  );
}
