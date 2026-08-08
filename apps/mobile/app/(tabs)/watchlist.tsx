import { useRouter } from "expo-router";
import { useState } from "react";

import { D0FixtureErrorScreen } from "../../src/components/d0/d0-fixture-error-screen";
import { WatchlistPanel } from "../../src/components/d0/watchlist-panel";
import { loadD0Fixture } from "../../src/lib/d0-fixture";

export default function WatchlistScreen() {
  const router = useRouter();
  const [fixtureResult, setFixtureResult] = useState(loadD0Fixture);

  if (fixtureResult.status !== "ready") {
    return (
      <D0FixtureErrorScreen
        errorMessage={fixtureResult.message}
        onRetry={() => setFixtureResult(loadD0Fixture())}
        subtitle="仅本次演示 · 刷新后重置"
        title="自选"
      />
    );
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
