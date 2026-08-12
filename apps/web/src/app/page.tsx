import { D0Feed } from "../components/feed/feed-card";
import { DesktopShell } from "../components/shell/desktop-shell";
import { PageState } from "../components/system/page-state";
import { HomeCommunityStream } from "../features/community/home-community-stream";
import { RealFinanceHomeSummary } from "../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../features/real-finance/finance-snapshot.server";
import { loadD0Fixture } from "../lib/d0-fixture";
import { normalizeD0FixtureState } from "../lib/d0-page-state";

export const dynamic = "force-dynamic";

type HomePageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export default async function HomePage({ searchParams }: HomePageProperties) {
  const fixtureResult = loadD0Fixture();
  const [parameters, financeModel] = await Promise.all([
    searchParams,
    loadRuntimeFinancePublicViewModel({ selectedRecordId: null }),
  ]);
  const state = normalizeD0FixtureState(parameters.fixture_state);

  return (
    <DesktopShell
      activeChannel="home"
      fixtureResult={fixtureResult}
      requiresD0Fixture={false}
    >
      <RealFinanceHomeSummary model={financeModel} />
      {fixtureResult.status === "ready" ? (
        <>
          <section className="feed-intro" aria-labelledby="feed-heading">
            <div>
              <p className="card-kicker">SYNTHETIC COMMUNITY</p>
              <h2 id="feed-heading">合成社区内容</h2>
            </div>
            <p>合成行情、帖子和互动仅用于功能演示，不属于财经资讯。</p>
          </section>
          <D0Feed
            cards={fixtureResult.data.feed.filter(
              (card) => card.type !== "news",
            )}
            fixture={fixtureResult.data}
            state={state}
          />
          {state === "normal" ? <HomeCommunityStream /> : null}
        </>
      ) : (
        <section aria-labelledby="feed-heading">
          <div className="feed-intro">
            <div>
              <p className="card-kicker">SYNTHETIC COMMUNITY</p>
              <h2 id="feed-heading">合成社区内容</h2>
            </div>
            <p>该分区与真实财经快照相互独立。</p>
          </div>
          <PageState state="error" errorMessage={fixtureResult.message} />
        </section>
      )}
    </DesktopShell>
  );
}
