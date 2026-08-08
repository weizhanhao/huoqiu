import type { D0Fixture } from "@huoqiu/contracts/d0";
import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useD0Watchlist } from "../../stores/d0-watchlist";
import { d0TextColors } from "../../styles/d0-colors";
import { PageState } from "./page-state";
import { ScreenHeader } from "./screen-header";
import { WatchlistToggle } from "./watchlist-toggle";

type WatchlistPanelProperties = Readonly<{
  fixture: D0Fixture;
  state: "normal" | "loading" | "empty" | "error";
  onOpenInstrument?: ((listingId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
}>;

export function WatchlistPanel({
  fixture,
  state,
  onOpenInstrument,
  onRetry,
}: WatchlistPanelProperties) {
  const { listingIds } = useD0Watchlist();
  const entries = listingIds.flatMap((listingId) => {
    const instrument = fixture.instruments.find(
      (candidate) => candidate.listing_id === listingId,
    );
    const quote = fixture.quotes.find(
      (candidate) => candidate.listing_id === listingId,
    );
    return instrument === undefined || quote === undefined
      ? []
      : [{ instrument, quote }];
  });

  return (
    <View style={styles.viewport}>
      <ScreenHeader subtitle="仅本次演示 · 刷新后重置" title="自选" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>SESSION WATCHLIST</Text>
          <Text style={styles.heroTitle}>我的自选</Text>
          <Text style={styles.heroCopy}>
            仅本次演示保留，不会跨设备同步，也不会发送网络 mutation。
          </Text>
        </View>

        <PageState
          emptyMessage="暂无自选标的"
          errorMessage="自选演示数据校验失败"
          onRetry={onRetry}
          state={state}
        >
          {entries.length === 0 ? (
            <PageState
              state="empty"
              emptyMessage="暂无自选标的，可从详情页加入"
            />
          ) : (
            <View style={styles.list}>
              {entries.map(({ instrument, quote }) => {
                const isUp = !quote.change.startsWith("-");
                return (
                  <View key={instrument.listing_id} style={styles.row}>
                    <Pressable
                      accessibilityHint={instrument.listing_id}
                      accessibilityLabel={`打开${instrument.name}详情`}
                      accessibilityRole="button"
                      onPress={() => onOpenInstrument?.(instrument.listing_id)}
                      style={styles.identity}
                      testID={"watchlist-detail-" + instrument.listing_id}
                    >
                      <Text style={styles.name}>{instrument.name}</Text>
                      <Text style={styles.symbol}>
                        {instrument.symbol} · {instrument.market}
                      </Text>
                    </Pressable>
                    <View style={styles.quote}>
                      <Text style={isUp ? styles.quoteUp : styles.quoteDown}>
                        {quote.last}
                      </Text>
                      <Text style={isUp ? styles.changeUp : styles.changeDown}>
                        {isUp ? "+" : ""}
                        {quote.change_pct}%
                      </Text>
                    </View>
                    <WatchlistToggle
                      listingId={instrument.listing_id}
                      removeLabel="移出自选"
                    />
                  </View>
                );
              })}
            </View>
          )}
        </PageState>
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
  hero: {
    backgroundColor: tokens.surface.inverse,
    borderRadius: 18,
    minHeight: 150,
    padding: 22,
  },
  kicker: {
    color: tokens.text.disabled,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroTitle: {
    color: tokens.text.inverse,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1,
    paddingBottom: 10,
    paddingTop: 20,
  },
  heroCopy: {
    color: tokens.text.disabled,
    fontSize: 12,
    lineHeight: 20,
  },
  list: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 96,
    padding: 14,
  },
  identity: {
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
  },
  name: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 5,
  },
  quote: {
    alignItems: "flex-end",
  },
  quoteUp: {
    color: d0TextColors.marketUp,
    fontSize: 15,
    fontWeight: "700",
  },
  quoteDown: {
    color: d0TextColors.marketDown,
    fontSize: 15,
    fontWeight: "700",
  },
  changeUp: {
    color: d0TextColors.marketUp,
    fontSize: 10,
    paddingTop: 4,
  },
  changeDown: {
    color: d0TextColors.marketDown,
    fontSize: 10,
    paddingTop: 4,
  },
});
