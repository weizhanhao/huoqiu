import { useRouter } from "expo-router";

import { PageState } from "../../src/components/d0/page-state";
import { WatchlistPanel } from "../../src/components/d0/watchlist-panel";
import { loadD0Fixture } from "../../src/lib/d0-fixture";

export default function WatchlistScreen() {
  const router = useRouter();
  const fixtureResult = loadD0Fixture();

  if (fixtureResult.status !== "ready") {
    return <PageState state="error" errorMessage={fixtureResult.message} />;
  }

  return (
    <WatchlistPanel
      fixture={fixtureResult.data}
      onOpenInstrument={(listingId) =>
        router.push({
          pathname: "/instrument/[listingId]",
          params: { listingId },
        })
      }
      state="normal"
    />
  );
}
