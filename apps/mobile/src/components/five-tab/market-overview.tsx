import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  marketRegions,
  type MarketRegionId,
  type SyntheticMarketRanking,
  type SyntheticMarketSnapshot,
} from "../../features/five-tab/synthetic-fixture";
import { appTouchMinimum } from "../../styles/app-touch";
import { ScreenHeader } from "../d0/screen-header";

type MarketOverviewProperties = Readonly<{
  snapshot: SyntheticMarketSnapshot;
  selectedRegion: MarketRegionId;
  onSelectRegion: (region: MarketRegionId) => void;
  onOpenInstrument?: ((listingId: string) => void) | undefined;
  onSearch?: (() => void) | undefined;
}>;

const changeLabel = (changePct: number): string =>
  `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`;

const changeStyle = (changePct: number) =>
  changePct > 0
    ? styles.changeUp
    : changePct < 0
      ? styles.changeDown
      : styles.changeFlat;

const RankingRow = ({
  entry,
  rank,
  onOpenInstrument,
}: Readonly<{
  entry: SyntheticMarketRanking;
  rank: number;
  onOpenInstrument?: ((listingId: string) => void) | undefined;
}>) => {
  const listingId = entry.listingId;
  const content = (
    <>
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.rankingIdentity}>
        <Text numberOfLines={1} style={styles.rankingName}>
          {entry.name}
        </Text>
        <Text style={styles.symbol}>{entry.symbol}</Text>
      </View>
      <View style={styles.rankingQuote}>
        <Text style={styles.rankingLast}>{entry.last}</Text>
        <Text style={changeStyle(entry.changePct)}>
          {changeLabel(entry.changePct)}
        </Text>
      </View>
    </>
  );

  return listingId === undefined ? (
    <View key={entry.id} style={styles.rankingRow}>
      {content}
    </View>
  ) : (
    <Pressable
      accessibilityHint={listingId}
      accessibilityLabel={`查看${entry.name}详情`}
      accessibilityRole="button"
      key={entry.id}
      onPress={() => onOpenInstrument?.(listingId)}
      style={styles.rankingRow}
    >
      {content}
    </Pressable>
  );
};

export function MarketOverview({
  snapshot,
  selectedRegion,
  onSelectRegion,
  onOpenInstrument,
  onSearch,
}: MarketOverviewProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onSearch={onSearch}
        subtitle="固定离线快照 · 多市场观察"
        title="行情"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityRole="tablist" style={styles.regionTabs}>
          {marketRegions.map((region) => {
            const selected = region.id === selectedRegion;
            return (
              <Pressable
                accessibilityLabel={`查看${region.label}行情`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                key={region.id}
                onPress={() => onSelectRegion(region.id)}
                style={[styles.regionTab, selected && styles.regionTabSelected]}
              >
                <Text
                  style={[
                    styles.regionLabel,
                    selected && styles.regionLabelSelected,
                  ]}
                >
                  {region.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.indexGrid}>
          {snapshot.indices.map((index) => (
            <View key={index.id} style={styles.indexCard}>
              <Text numberOfLines={1} style={styles.indexName}>
                {index.name}
              </Text>
              <Text style={styles.indexLast}>{index.last}</Text>
              <Text style={changeStyle(index.changePct)}>
                {changeLabel(index.changePct)}
              </Text>
              <Text style={styles.indexSymbol}>{index.symbol}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>市场涨跌概况</Text>
              <Text style={styles.sectionSubtitle}>
                合成热度 {snapshot.breadth.heat}%
              </Text>
            </View>
            <Text style={styles.asOf}>固定于 {snapshot.asOf}</Text>
          </View>
          <View
            accessibilityLabel={`上涨 ${snapshot.breadth.up}，平盘 ${snapshot.breadth.flat}，下跌 ${snapshot.breadth.down}`}
            accessibilityRole="summary"
            style={styles.breadthBar}
          >
            <View style={[styles.breadthUp, { flex: snapshot.breadth.up }]} />
            <View
              style={[styles.breadthFlat, { flex: snapshot.breadth.flat }]}
            />
            <View
              style={[styles.breadthDown, { flex: snapshot.breadth.down }]}
            />
          </View>
          <View style={styles.breadthLabels}>
            <Text style={styles.upText}>上涨 {snapshot.breadth.up}</Text>
            <Text style={styles.flatText}>平盘 {snapshot.breadth.flat}</Text>
            <Text style={styles.downText}>下跌 {snapshot.breadth.down}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>涨幅榜预览</Text>
              <Text style={styles.sectionSubtitle}>固定合成快照前三名</Text>
            </View>
            <Text style={styles.previewBadge}>预览</Text>
          </View>
          <View style={styles.rankingList}>
            {snapshot.ranking.map((entry, index) =>
              RankingRow({
                entry,
                onOpenInstrument,
                rank: index + 1,
              }),
            )}
          </View>
        </View>

        <Text style={styles.disclosure}>
          {snapshot.source} · 演示数据，不构成投资建议
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
    paddingBottom: 32,
  },
  regionTabs: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 6,
  },
  regionTab: {
    alignItems: "center",
    borderRadius: 14,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 70,
    paddingHorizontal: 14,
  },
  regionTabSelected: {
    backgroundColor: tokens.surface.subtle,
  },
  regionLabel: {
    color: tokens.text.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  regionLabelSelected: {
    color: tokens.brand.primaryHover,
  },
  indexGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  indexCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 104,
    padding: 14,
  },
  indexName: {
    color: tokens.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  indexLast: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
    paddingBottom: 6,
    paddingTop: 10,
  },
  indexSymbol: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 10,
  },
  changeUp: {
    color: tokens.market.upText,
    fontSize: 12,
    fontWeight: "700",
  },
  changeDown: {
    color: tokens.market.downText,
    fontSize: 12,
    fontWeight: "700",
  },
  changeFlat: {
    color: tokens.market.flat,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  sectionHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: tokens.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: tokens.text.secondary,
    fontSize: 12,
    paddingTop: 5,
  },
  asOf: {
    color: tokens.text.tertiary,
    fontSize: 9,
    maxWidth: 136,
    textAlign: "right",
  },
  breadthBar: {
    borderRadius: 6,
    flexDirection: "row",
    height: 12,
    marginTop: 22,
    overflow: "hidden",
  },
  breadthUp: {
    backgroundColor: tokens.market.up,
  },
  breadthFlat: {
    backgroundColor: tokens.market.flat,
  },
  breadthDown: {
    backgroundColor: tokens.market.down,
  },
  breadthLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  upText: {
    color: tokens.market.upText,
    fontSize: 11,
    fontWeight: "600",
  },
  flatText: {
    color: tokens.market.flat,
    fontSize: 11,
    fontWeight: "600",
  },
  downText: {
    color: tokens.market.downText,
    fontSize: 11,
    fontWeight: "600",
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
  rankingList: {
    paddingTop: 12,
  },
  rankingRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: appTouchMinimum,
    paddingVertical: 12,
  },
  rank: {
    color: tokens.market.warningText,
    fontSize: 13,
    fontWeight: "700",
    width: 18,
  },
  rankingIdentity: {
    flex: 1,
    minWidth: 0,
  },
  rankingName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 4,
  },
  rankingQuote: {
    alignItems: "flex-end",
  },
  rankingLast: {
    color: tokens.text.primary,
    fontSize: 14,
    fontWeight: "600",
    paddingBottom: 4,
  },
  disclosure: {
    color: tokens.market.warningText,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
