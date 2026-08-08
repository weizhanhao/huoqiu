import { DesktopShell } from "../../components/shell/desktop-shell";
import { WatchlistPanel } from "../../components/watchlist/watchlist-panel";
import { loadD0Fixture } from "../../lib/d0-fixture";

export default function WatchlistPage() {
  const fixtureResult = loadD0Fixture();

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {fixtureResult.status === "ready" ? (
        <WatchlistPanel fixture={fixtureResult.data} />
      ) : null}
    </DesktopShell>
  );
}
