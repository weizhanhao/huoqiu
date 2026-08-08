import { useRouter } from "expo-router";

import { HomeFeed } from "../../src/components/d0/home-feed";
import { PageState } from "../../src/components/d0/page-state";
import { loadD0Fixture } from "../../src/lib/d0-fixture";

export default function HomeScreen() {
  const router = useRouter();
  const fixtureResult = loadD0Fixture();

  if (fixtureResult.status !== "ready") {
    return <PageState state="error" errorMessage={fixtureResult.message} />;
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
