import { useLocalSearchParams } from "expo-router";

import { InstrumentDetail } from "../../src/components/d0/instrument-detail";
import { PageState } from "../../src/components/d0/page-state";
import { loadD0Fixture } from "../../src/lib/d0-fixture";

export default function InstrumentScreen() {
  const parameters = useLocalSearchParams<{ listingId?: string | string[] }>();
  const fixtureResult = loadD0Fixture();
  const listingId = Array.isArray(parameters.listingId)
    ? parameters.listingId[0]
    : parameters.listingId;

  if (fixtureResult.status !== "ready") {
    return <PageState state="error" errorMessage={fixtureResult.message} />;
  }

  return (
    <InstrumentDetail
      fixture={fixtureResult.data}
      listingId={listingId ?? ""}
      state="normal"
    />
  );
}
