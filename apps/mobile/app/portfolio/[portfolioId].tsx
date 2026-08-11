import { tokens } from "@huoqiu/native-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { PageState } from "../../src/components/d0/page-state";
import { ScreenHeader } from "../../src/components/d0/screen-header";
import { PortfolioDetailView } from "../../src/components/five-tab/portfolio-detail";
import { getPortfolioDetail } from "../../src/features/five-tab/synthetic-fixture";
import { createD0BackHandler } from "../../src/navigation/back-or-home";

export default function PortfolioDetailScreen() {
  const router = useRouter();
  const parameters = useLocalSearchParams<{
    portfolioId?: string | string[];
  }>();
  const portfolioId = Array.isArray(parameters.portfolioId)
    ? parameters.portfolioId[0]
    : parameters.portfolioId;
  const detail = getPortfolioDetail(portfolioId ?? "");
  const onBack = createD0BackHandler(router, "/portfolios");

  if (detail === undefined) {
    return (
      <View style={styles.viewport}>
        <ScreenHeader
          onBack={onBack}
          subtitle="固定合成数据"
          title="组合详情"
        />
        <View style={styles.state}>
          <PageState state="empty" emptyMessage="未找到该合成组合" />
        </View>
      </View>
    );
  }

  return <PortfolioDetailView detail={detail} onBack={onBack} />;
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  state: {
    padding: 16,
  },
});
