import { useRouter } from "expo-router";
import { useState } from "react";

import { D0FixtureErrorScreen } from "../../src/components/d0/d0-fixture-error-screen";
import { HomeFeed } from "../../src/components/d0/home-feed";
import { loadD0Fixture } from "../../src/lib/d0-fixture";

export default function HomeScreen() {
  const router = useRouter();
  const [fixtureResult, setFixtureResult] = useState(loadD0Fixture);

  if (fixtureResult.status !== "ready") {
    return (
      <D0FixtureErrorScreen
        errorMessage={fixtureResult.message}
        onRetry={() => setFixtureResult(loadD0Fixture())}
        subtitle="公开市场信息的观察与整理"
        title="火球"
      />
    );
  }

  return (
    <HomeFeed
      fixture={fixtureResult.data}
      onOpenInstrument={(listingId) =>
        router.push({
          pathname: "/instrument/[listingId]",
          params: { listingId },
        })
      }
      onSearch={() => router.push("/search")}
      state="normal"
    />
  );
}
