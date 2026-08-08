import { useRouter } from "expo-router";
import { useState } from "react";

import { InstrumentSearch } from "../src/components/d0/instrument-search";
import { PageState } from "../src/components/d0/page-state";
import { loadD0Fixture } from "../src/lib/d0-fixture";

export default function SearchScreen() {
  const router = useRouter();
  const fixtureResult = loadD0Fixture();
  const [query, setQuery] = useState("");

  if (fixtureResult.status !== "ready") {
    return <PageState state="error" errorMessage={fixtureResult.message} />;
  }

  return (
    <InstrumentSearch
      fixture={fixtureResult.data}
      onOpenInstrument={(listingId) =>
        router.push({
          pathname: "/instrument/[listingId]",
          params: { listingId },
        })
      }
      onQueryChange={setQuery}
      query={query}
      state="normal"
    />
  );
}
