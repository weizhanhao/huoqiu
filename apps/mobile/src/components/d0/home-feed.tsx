import type { D0Fixture } from "@huoqiu/contracts/d0";
import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  d0MaestroLabels,
  d0OpenInstrumentLabel,
} from "../../accessibility/d0-maestro-labels";
import { d0TextColors } from "../../styles/d0-colors";
import { PageState } from "./page-state";
import { ScreenHeader } from "./screen-header";

type HomeFeedProperties = Readonly<{
  fixture: D0Fixture;
  state: "normal" | "loading" | "empty" | "error";
  onSearch?: (() => void) | undefined;
  onOpenInstrument?: ((listingId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
}>;

const readPayloadString = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string,
): string => {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
};

export function HomeFeed({
  fixture,
  state,
  onSearch,
  onOpenInstrument,
  onRetry,
}: HomeFeedProperties) {
  const instrument = fixture.instruments[0];
  const quote = fixture.quotes[0];

  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onSearch={onSearch}
        subtitle="公开市场信息的观察与整理"
        title="火球"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroTopline}>
            <Text style={[styles.kicker, styles.heroKicker]}>
              D0 / FIXTURE FEED
            </Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {d0MaestroLabels.demoData}
              </Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>
            从一条合成行情开始，验证核心信息链。
          </Text>
          <Text style={styles.heroMeta}>
            {fixture.market.source} · {fixture.market.as_of}
          </Text>
        </View>

        <PageState
          emptyMessage="暂无演示内容"
          errorMessage="演示数据校验失败"
          onRetry={onRetry}
          state={state}
        >
          {instrument === undefined || quote === undefined ? (
            <PageState state="empty" emptyMessage="暂无演示标的" />
          ) : (
            <>
              <Pressable
                accessibilityHint={instrument.listing_id}
                accessibilityLabel={d0OpenInstrumentLabel(instrument.name)}
                accessibilityRole="button"
                onPress={() => onOpenInstrument?.(instrument.listing_id)}
                style={styles.marketCard}
              >
                <View style={styles.cardHeading}>
                  <View>
                    <Text style={[styles.kicker, styles.baseKicker]}>
                      合成行情
                    </Text>
                    <Text style={styles.marketName}>{instrument.name}</Text>
                    <Text style={styles.symbol}>
                      {instrument.symbol} · {instrument.market} ·{" "}
                      {instrument.currency}
                    </Text>
                  </View>
                  <View style={styles.quote}>
                    <Text style={styles.quoteLast}>{quote.last}</Text>
                    <Text style={styles.quoteChange}>+{quote.change_pct}%</Text>
                  </View>
                </View>
                <View style={styles.sparkline}>
                  {[12, 22, 18, 30, 26, 38, 34, 44, 40, 52, 48, 62].map(
                    (height, index) => (
                      <View key={index} style={[styles.sparkBar, { height }]} />
                    ),
                  )}
                </View>
                <Text style={styles.notice}>演示数据，不构成投资建议</Text>
              </Pressable>

              {fixture.feed.flatMap((card) => {
                if (card.type === "post") {
                  return (
                    <View key={card.card_id} style={styles.contentCard}>
                      <View style={styles.contentMeta}>
                        <Text style={styles.contentAuthor}>
                          {readPayloadString(
                            card.payload,
                            "author_name",
                            "演示用户",
                          )}
                        </Text>
                        <Text style={styles.contentKind}>观察</Text>
                      </View>
                      <Text style={styles.contentTitle}>
                        {readPayloadString(card.payload, "title", "演示笔记")}
                      </Text>
                      <Text style={styles.contentBody}>
                        {readPayloadString(card.payload, "body", "暂无正文")}
                      </Text>
                      <Text style={styles.contentSource}>
                        {card.source} · {card.published_at}
                      </Text>
                    </View>
                  );
                }
                if (card.type === "news") {
                  return (
                    <View key={card.card_id} style={styles.contentCard}>
                      <View style={styles.contentMeta}>
                        <Text style={styles.contentAuthor}>
                          {readPayloadString(
                            card.payload,
                            "publisher",
                            "火球演示资讯",
                          )}
                        </Text>
                        <Text style={styles.contentKind}>资讯</Text>
                      </View>
                      <Text style={styles.contentTitle}>
                        {readPayloadString(card.payload, "title", "演示资讯")}
                      </Text>
                      <Text style={styles.contentBody}>
                        {readPayloadString(card.payload, "summary", "暂无摘要")}
                      </Text>
                      <Text style={styles.contentSource}>
                        {card.source} · {card.published_at}
                      </Text>
                    </View>
                  );
                }
                return [];
              })}
            </>
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
    overflow: "hidden",
    padding: 22,
  },
  heroTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroKicker: {
    color: d0TextColors.inverseMuted,
  },
  baseKicker: {
    color: tokens.text.secondary,
  },
  heroBadge: {
    backgroundColor: tokens.brand.primary,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: tokens.brand.onPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  heroTitle: {
    color: tokens.text.inverse,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 34,
    paddingBottom: 18,
    paddingTop: 26,
  },
  heroMeta: {
    color: tokens.text.disabled,
    fontSize: 11,
  },
  marketCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 18,
  },
  cardHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  marketName: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
    paddingBottom: 4,
    paddingTop: 8,
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  quote: {
    alignItems: "flex-end",
  },
  quoteLast: {
    color: d0TextColors.marketUp,
    fontSize: 22,
    fontWeight: "700",
  },
  quoteChange: {
    color: d0TextColors.marketUp,
    fontSize: 12,
    fontWeight: "600",
    paddingTop: 4,
  },
  sparkline: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 5,
    height: 72,
    paddingTop: 10,
  },
  sparkBar: {
    backgroundColor: tokens.market.up,
    borderRadius: 2,
    flex: 1,
    opacity: 0.58,
  },
  notice: {
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: d0TextColors.warning,
    fontSize: 11,
    marginTop: 12,
    paddingTop: 10,
  },
  contentCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  contentMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contentAuthor: {
    color: tokens.text.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  contentKind: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    color: tokens.brand.primary,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  contentTitle: {
    color: tokens.text.primary,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 28,
    paddingBottom: 8,
    paddingTop: 16,
  },
  contentBody: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 23,
  },
  contentSource: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 14,
  },
});
