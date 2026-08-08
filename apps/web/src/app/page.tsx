import { D0Feed } from "../components/feed/feed-card";
import { DesktopShell } from "../components/shell/desktop-shell";
import { loadD0Fixture } from "../lib/d0-fixture";
import { normalizeD0FixtureState } from "../lib/d0-page-state";

type HomePageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export default async function HomePage({ searchParams }: HomePageProperties) {
  const fixtureResult = loadD0Fixture();
  const state = normalizeD0FixtureState((await searchParams).fixture_state);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {fixtureResult.status === "ready" ? (
        <>
          <section className="feed-intro" aria-labelledby="feed-heading">
            <div>
              <p className="card-kicker">D0 / FIXTURE FEED</p>
              <h2 id="feed-heading">公开市场信息的观察与整理</h2>
            </div>
            <p>内容与行情均来自固定离线数据，可重复验证。</p>
          </section>
          <nav className="channel-tabs" aria-label="首页频道">
            <a href="/" aria-current="page">
              首页
            </a>
            <span>市场快照</span>
            <span>公开笔记</span>
          </nav>
          <D0Feed
            cards={fixtureResult.data.feed}
            fixture={fixtureResult.data}
            state={state}
          />
        </>
      ) : null}
    </DesktopShell>
  );
}
