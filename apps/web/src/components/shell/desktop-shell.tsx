import type { ReactNode } from "react";

import { loadD0Fixture, type D0FixtureLoadResult } from "../../lib/d0-fixture";
import { D0WatchlistProvider } from "../../stores/d0-watchlist";
import { DemoDataBadge } from "../system/demo-data-badge";
import { PageState } from "../system/page-state";

type DesktopShellProperties = Readonly<{
  children: ReactNode;
  fixtureResult?: D0FixtureLoadResult;
}>;

export function DesktopShell({
  children,
  fixtureResult = loadD0Fixture(),
}: DesktopShellProperties) {
  const fixture = fixtureResult.status === "ready" ? fixtureResult.data : null;
  const knownListingIds =
    fixture?.instruments.map((instrument) => instrument.listing_id) ?? [];

  return (
    <D0WatchlistProvider knownListingIds={knownListingIds}>
      <div className="d0-app-shell">
        <header className="d0-topbar">
          <a className="d0-brand" href="/" aria-label="火球首页">
            <span className="brand-mark" aria-hidden="true">
              火
            </span>
            <span>火球</span>
          </a>
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
          <DemoDataBadge />
        </header>

        <div className="d0-layout">
          <aside className="d0-sidebar" aria-label="主导航">
            <div className="seed-user">
              <span className="seed-avatar" aria-hidden="true">
                演
              </span>
              <div>
                <strong>{fixture?.seed_user.name ?? "演示用户"}</strong>
                <small>固定 Fixture 身份</small>
              </div>
            </div>
            <nav>
              <a href="/">首页</a>
              <a href="/watchlist">自选</a>
            </nav>
            <p className="session-disclosure">仅本机演示，不会跨端同步</p>
          </aside>

          <main className="d0-main">
            {fixtureResult.status === "ready" ? (
              children
            ) : (
              <PageState state="error" errorMessage={fixtureResult.message} />
            )}
          </main>

          <aside className="d0-rail" aria-label="演示行情榜单">
            <div className="rail-heading">
              <h2>演示行情</h2>
              <span>固定快照</span>
            </div>
            {fixture?.instruments.map((instrument) => {
              const quote = fixture.quotes.find(
                (candidate) => candidate.listing_id === instrument.listing_id,
              );
              return (
                <a
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
                </a>
              );
            })}
            <p className="rail-disclosure">
              来源：huoqiu-synthetic
              <br />
              不构成投资建议
            </p>
          </aside>
        </div>
      </div>
    </D0WatchlistProvider>
  );
}
