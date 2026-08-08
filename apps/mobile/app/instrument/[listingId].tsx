import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { D0FixtureErrorScreen } from "../../src/components/d0/d0-fixture-error-screen";
import { InstrumentDetail } from "../../src/components/d0/instrument-detail";
import { loadD0Fixture } from "../../src/lib/d0-fixture";
import { createD0BackHandler } from "../../src/navigation/back-or-home";

export default function InstrumentScreen() {
  const router = useRouter();
  const parameters = useLocalSearchParams<{ listingId?: string | string[] }>();
  const [fixtureResult, setFixtureResult] = useState(loadD0Fixture);
  const onBack = createD0BackHandler(router);
  const listingId = Array.isArray(parameters.listingId)
    ? parameters.listingId[0]
    : parameters.listingId;

  if (fixtureResult.status !== "ready") {
    return (
      <D0FixtureErrorScreen
        errorMessage={fixtureResult.message}
        onBack={onBack}
        onRetry={() => setFixtureResult(loadD0Fixture())}
        title="标的详情"
      />
    );
  }

  return (
    <InstrumentDetail
      fixture={fixtureResult.data}
      listingId={listingId ?? ""}
      onBack={onBack}
      state="normal"
    />
  );
}
