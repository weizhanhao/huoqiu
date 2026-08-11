import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  portfolioPeriods,
  type PortfolioPeriodId,
  type SyntheticPortfolioHub,
} from "../../features/five-tab/synthetic-fixture";
import { appTouchMinimum } from "../../styles/app-touch";
import { ScreenHeader } from "../d0/screen-header";

type PortfolioHubProperties = Readonly<{
  hub: SyntheticPortfolioHub;
  selectedPeriod: PortfolioPeriodId;
  onSelectPeriod: (period: PortfolioPeriodId) => void;
  onOpenPortfolio: (portfolioId: string) => void;
  onSearch?: (() => void) | undefined;
}>;

const percentage = (value: number): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function PortfolioHub({
  hub,
  selectedPeriod,
  onSelectPeriod,
  onOpenPortfolio,
  onSearch,
}: PortfolioHubProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onSearch={onSearch}
        subtitle="合成组合观察 · 不连接真实账户"
        title="组合"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeading}>
            <View>
              <Text style={styles.summaryTitle}>组合盈亏概况</Text>
              <Text style={styles.summaryMeta}>固定于 {hub.asOf}</Text>
            </View>
            <Text style={styles.syntheticBadge}>合成</Text>
          </View>
          <View style={styles.summaryValues}>
            <View>
              <Text style={styles.upLabel}>盈利组合</Text>
              <Text style={styles.upValue}>{hub.summary.profit}%</Text>
            </View>
            <View style={styles.summaryValueRight}>
              <Text style={styles.downLabel}>亏损组合</Text>
              <Text style={styles.downValue}>{hub.summary.loss}%</Text>
            </View>
          </View>
          <View
            accessibilityLabel={`盈利组合 ${hub.summary.profit}%，平盘 ${hub.summary.flat}%，亏损组合 ${hub.summary.loss}%`}
            accessibilityRole="summary"
            style={styles.summaryBar}
          >
            <View style={[styles.profitBar, { flex: hub.summary.profit }]} />
            <View style={[styles.flatBar, { flex: hub.summary.flat }]} />
            <View style={[styles.lossBar, { flex: hub.summary.loss }]} />
          </View>
          <Text style={styles.flatCopy}>平盘组合 {hub.summary.flat}%</Text>
        </View>

        <View>
          <Text style={styles.sectionTitle}>组合风向指标</Text>
          <Text style={styles.sectionSubtitle}>固定快照中的公开观察信号</Text>
          <View style={styles.signalGrid}>
            {hub.signals.map((signal) => (
              <View key={signal.id} style={styles.signalCard}>
                <Text style={styles.signalLabel}>{signal.label}</Text>
                <Text style={styles.signalValue}>{signal.value}</Text>
                <Text style={styles.signalCaption}>{signal.caption}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.rankingCard}>
          <View style={styles.rankingHeading}>
            <View>
              <Text style={styles.sectionTitle}>组合排行榜</Text>
              <Text style={styles.sectionSubtitle}>只展示合成组合收益</Text>
            </View>
            <Text style={styles.previewBadge}>预览</Text>
          </View>
          <View accessibilityRole="tablist" style={styles.periodTabs}>
            {portfolioPeriods.map((period) => {
              const selected = period.id === selectedPeriod;
              return (
                <Pressable
                  accessibilityLabel={`查看组合${period.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  key={period.id}
                  onPress={() => onSelectPeriod(period.id)}
                  style={[
                    styles.periodTab,
                    selected && styles.periodTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodLabel,
                      selected && styles.periodLabelSelected,
                    ]}
                  >
                    {period.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rankingList}>
            {hub.ranking.map((portfolio, index) => (
              <Pressable
                accessibilityHint={portfolio.id}
                accessibilityLabel={`查看${portfolio.title}详情`}
                accessibilityRole="button"
                key={portfolio.id}
                onPress={() => onOpenPortfolio(portfolio.id)}
                style={styles.rankingRow}
              >
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.portfolioIdentity}>
                  <Text numberOfLines={1} style={styles.portfolioTitle}>
                    {portfolio.title}
                  </Text>
                  <Text style={styles.portfolioMeta}>
                    {portfolio.manager} · {portfolio.riskLabel}
                  </Text>
                  <Text style={styles.followers}>
                    {portfolio.followers.toLocaleString("zh-CN")} 人合成关注
                  </Text>
                </View>
                <Text style={styles.returnValue}>
                  {percentage(portfolio.returnPct)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.disclosure}>
          {hub.source} · 纯合成组合，不连接真实账户，不构成投资建议
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
    gap: 18,
    padding: 16,
    paddingBottom: 32,
  },
  summaryCard: {
    backgroundColor: tokens.surface.inverse,
    borderRadius: 20,
    padding: 20,
  },
  summaryHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryTitle: {
    color: tokens.text.inverse,
    fontSize: 20,
    fontWeight: "700",
  },
  summaryMeta: {
    color: tokens.text.inverseMuted,
    fontSize: 10,
    paddingTop: 6,
  },
  syntheticBadge: {
    backgroundColor: tokens.brand.primary,
    borderRadius: 12,
    color: tokens.brand.onPrimary,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryValues: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 26,
  },
  summaryValueRight: {
    alignItems: "flex-end",
  },
  upLabel: {
    color: tokens.text.inverseMuted,
    fontSize: 12,
  },
  upValue: {
    color: "#FF9C98",
    fontSize: 24,
    fontWeight: "700",
    paddingTop: 4,
  },
  downLabel: {
    color: tokens.text.inverseMuted,
    fontSize: 12,
  },
  downValue: {
    color: "#7CE1C3",
    fontSize: 24,
    fontWeight: "700",
    paddingTop: 4,
  },
  summaryBar: {
    borderRadius: 6,
    flexDirection: "row",
    height: 12,
    marginTop: 18,
    overflow: "hidden",
  },
  profitBar: {
    backgroundColor: tokens.market.up,
  },
  flatBar: {
    backgroundColor: tokens.market.flat,
  },
  lossBar: {
    backgroundColor: tokens.market.down,
  },
  flatCopy: {
    color: tokens.text.inverseMuted,
    fontSize: 10,
    paddingTop: 8,
    textAlign: "center",
  },
  sectionTitle: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: tokens.text.secondary,
    fontSize: 12,
    paddingTop: 5,
  },
  signalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 12,
  },
  signalCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 104,
    padding: 14,
  },
  signalLabel: {
    color: tokens.text.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  signalValue: {
    color: tokens.brand.primaryHover,
    fontSize: 18,
    fontWeight: "700",
    paddingBottom: 8,
    paddingTop: 10,
  },
  signalCaption: {
    color: tokens.text.tertiary,
    fontSize: 10,
    lineHeight: 15,
  },
  rankingCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  rankingHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewBadge: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    color: tokens.brand.primaryHover,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  periodTabs: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 14,
    flexDirection: "row",
    gap: 5,
    marginTop: 16,
    padding: 5,
  },
  periodTab: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  periodTabSelected: {
    backgroundColor: tokens.surface.base,
  },
  periodLabel: {
    color: tokens.text.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  periodLabelSelected: {
    color: tokens.brand.primaryHover,
  },
  rankingList: {
    paddingTop: 8,
  },
  rankingRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingVertical: 14,
  },
  rank: {
    color: tokens.market.warningText,
    fontSize: 14,
    fontWeight: "700",
    width: 20,
  },
  portfolioIdentity: {
    flex: 1,
    minWidth: 0,
  },
  portfolioTitle: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  portfolioMeta: {
    color: tokens.text.secondary,
    fontSize: 11,
    paddingTop: 5,
  },
  followers: {
    color: tokens.text.tertiary,
    fontSize: 9,
    paddingTop: 4,
  },
  returnValue: {
    color: tokens.market.upText,
    fontSize: 17,
    fontWeight: "700",
  },
  disclosure: {
    color: tokens.market.warningText,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
