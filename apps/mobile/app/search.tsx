import { useRouter } from "expo-router";
import { useState } from "react";

import { D0FixtureErrorScreen } from "../src/components/d0/d0-fixture-error-screen";
import { InstrumentSearch } from "../src/components/d0/instrument-search";
import { loadD0Fixture } from "../src/lib/d0-fixture";
import { createD0BackHandler } from "../src/navigation/back-or-home";

export default function SearchScreen() {
  const router = useRouter();
  const [fixtureResult, setFixtureResult] = useState(loadD0Fixture);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const onBack = createD0BackHandler(router);

  if (fixtureResult.status !== "ready") {
    return (
      <D0FixtureErrorScreen
        errorMessage={fixtureResult.message}
        onBack={onBack}
        onRetry={() => setFixtureResult(loadD0Fixture())}
        subtitle="代码 · 名称 · 拼音 · 别名"
        title="搜索"
      />
    );
  }

  return (
    <InstrumentSearch
      fixture={fixtureResult.data}
      onBack={onBack}
      onOpenInstrument={(listingId) =>
        router.push({
          pathname: "/instrument/[listingId]",
          params: { listingId },
        })
      }
      onQueryChange={setQuery}
      onSubmit={() => setSubmittedQuery(query.trim())}
      query={query}
      state="normal"
      submittedQuery={submittedQuery}
    />
  );
}
