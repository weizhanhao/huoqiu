import { useRouter } from "expo-router";
import { useState } from "react";

import { MarketOverview } from "../../src/components/five-tab/market-overview";
import {
  getMarketSnapshot,
  type MarketRegionId,
} from "../../src/features/five-tab/synthetic-fixture";

export default function MarketsScreen() {
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState<MarketRegionId>("a");

  return (
    <MarketOverview
      onOpenInstrument={(listingId) =>
        router.push({
          pathname: "/instrument/[listingId]",
          params: { listingId },
        })
      }
      onSearch={() => router.push("/search")}
      onSelectRegion={setSelectedRegion}
      selectedRegion={selectedRegion}
      snapshot={getMarketSnapshot(selectedRegion)}
    />
  );
}
