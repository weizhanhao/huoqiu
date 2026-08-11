import { useRouter } from "expo-router";
import { useState } from "react";

import { PortfolioHub } from "../../src/components/five-tab/portfolio-hub";
import {
  getPortfolioHub,
  type PortfolioPeriodId,
} from "../../src/features/five-tab/synthetic-fixture";

export default function PortfoliosScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] =
    useState<PortfolioPeriodId>("day");

  return (
    <PortfolioHub
      hub={getPortfolioHub(selectedPeriod)}
      onOpenPortfolio={(portfolioId) =>
        router.push({
          pathname: "/portfolio/[portfolioId]",
          params: { portfolioId },
        })
      }
      onSearch={() => router.push("/search")}
      onSelectPeriod={setSelectedPeriod}
      selectedPeriod={selectedPeriod}
    />
  );
}
