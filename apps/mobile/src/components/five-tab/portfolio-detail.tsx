import { tokens } from "@huoqiu/native-ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { SyntheticPortfolioDetail } from "../../features/five-tab/synthetic-fixture";
import { ScreenHeader } from "../d0/screen-header";

type PortfolioDetailViewProperties = Readonly<{
  detail: SyntheticPortfolioDetail;
  onBack: () => void;
}>;

const signedPercentage = (value: number): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function PortfolioDetailView({
  detail,
  onBack,
}: PortfolioDetailViewProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onBack={onBack}
        subtitle="合成组合详情"
        title={detail.title}
      />
      <ScrollView contentContainerStyle={styles.content} tabIndex={0}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>SYNTHETIC PORTFOLIO</Text>
          <Text style={styles.manager}>{detail.manager}</Text>
          <Text style={styles.description}>{detail.description}</Text>
          <View style={styles.metrics}>
            <View
              accessibilityLabel={`成立以来 ${signedPercentage(detail.sinceInceptionPct)}`}
              style={styles.metric}
            >
              <Text style={styles.metricLabel}>成立以来</Text>
              <Text style={styles.metricUp}>
                {signedPercentage(detail.sinceInceptionPct)}
              </Text>
            </View>
            <View
              accessibilityLabel={`最大回撤 ${signedPercentage(detail.maxDrawdownPct)}`}
              style={styles.metric}
            >
              <Text style={styles.metricLabel}>最大回撤</Text>
              <Text style={styles.metricDown}>
                {signedPercentage(detail.maxDrawdownPct)}
              </Text>
            </View>
          </View>
          <Text style={styles.followers}>
            {detail.followers.toLocaleString("zh-CN")} 人合成关注 · 固定于{" "}
            {detail.asOf}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>持仓快照</Text>
          <Text style={styles.sectionSubtitle}>固定权重，仅用于界面演示</Text>
          <View style={styles.list}>
            {detail.holdings.map((holding) => {
              const isUp = holding.changePct > 0;
              return (
                <View key={holding.id} style={styles.holdingRow}>
                  <View style={styles.holdingIdentity}>
                    <Text style={styles.holdingName}>{holding.name}</Text>
                    <Text style={styles.symbol}>{holding.symbol}</Text>
                  </View>
                  <View style={styles.holdingMetrics}>
                    <Text style={styles.weight}>{holding.weightPct}% 权重</Text>
                    <Text style={isUp ? styles.changeUp : styles.changeDown}>
                      {signedPercentage(holding.changePct)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>模拟调仓记录</Text>
          <Text style={styles.sectionSubtitle}>按固定时间倒序展示</Text>
          <View style={styles.list}>
            {detail.adjustments.map((adjustment) => (
              <View key={adjustment.id} style={styles.adjustmentRow}>
                <View style={styles.timelineDot} />
                <View style={styles.adjustmentCopy}>
                  <View style={styles.adjustmentMeta}>
                    <Text style={styles.adjustmentBadge}>
                      {adjustment.action}
                    </Text>
                    <Text style={styles.adjustmentAt}>{adjustment.at}</Text>
                  </View>
                  <Text style={styles.adjustmentNote}>{adjustment.note}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.disclosure}>
          {detail.source} · 仅为固定合成组合，不产生真实交易，不构成投资建议
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: tokens.surface.inverse,
    borderRadius: 20,
    padding: 22,
  },
  heroKicker: {
    color: tokens.text.inverseMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  manager: {
    color: tokens.text.inverse,
    fontSize: 23,
    fontWeight: "700",
    paddingTop: 18,
  },
  description: {
    color: tokens.text.inverseMuted,
    fontSize: 13,
    lineHeight: 21,
    paddingTop: 8,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 22,
  },
  metric: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    flex: 1,
    padding: 14,
  },
  metricLabel: {
    color: tokens.text.inverseMuted,
    fontSize: 11,
  },
  metricUp: {
    color: "#FF9C98",
    fontSize: 20,
    fontWeight: "700",
    paddingTop: 6,
  },
  metricDown: {
    color: "#7CE1C3",
    fontSize: 20,
    fontWeight: "700",
    paddingTop: 6,
  },
  followers: {
    color: tokens.text.inverseMuted,
    fontSize: 9,
    paddingTop: 14,
  },
  sectionCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  sectionTitle: {
    color: tokens.text.primary,
    fontSize: 19,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: tokens.text.secondary,
    fontSize: 11,
    paddingTop: 5,
  },
  list: {
    paddingTop: 12,
  },
  holdingRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 72,
  },
  holdingIdentity: {
    flex: 1,
  },
  holdingName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 4,
  },
  holdingMetrics: {
    alignItems: "flex-end",
  },
  weight: {
    color: tokens.text.secondary,
    fontSize: 12,
  },
  changeUp: {
    color: tokens.market.upText,
    fontSize: 11,
    fontWeight: "700",
    paddingTop: 4,
  },
  changeDown: {
    color: tokens.market.downText,
    fontSize: 11,
    fontWeight: "700",
    paddingTop: 4,
  },
  adjustmentRow: {
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
  },
  timelineDot: {
    backgroundColor: tokens.brand.primary,
    borderRadius: 5,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  adjustmentCopy: {
    flex: 1,
  },
  adjustmentMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adjustmentBadge: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 10,
    color: tokens.brand.primaryHover,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adjustmentAt: {
    color: tokens.text.tertiary,
    fontSize: 9,
  },
  adjustmentNote: {
    color: tokens.text.secondary,
    fontSize: 12,
    lineHeight: 19,
    paddingTop: 8,
  },
  disclosure: {
    color: tokens.market.warningText,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
