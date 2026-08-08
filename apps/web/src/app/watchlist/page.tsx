import { DesktopShell } from "../../components/shell/desktop-shell";
import { WatchlistPanel } from "../../components/watchlist/watchlist-panel";
import { loadD0Fixture } from "../../lib/d0-fixture";
import { normalizeD0FixtureState } from "../../lib/d0-page-state";

type WatchlistPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export default async function WatchlistPage({
  searchParams,
}: WatchlistPageProperties) {
  const fixtureResult = loadD0Fixture();
  const state = normalizeD0FixtureState((await searchParams).fixture_state);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {fixtureResult.status === "ready" ? (
        <WatchlistPanel fixture={fixtureResult.data} state={state} />
      ) : null}
    </DesktopShell>
  );
}
