import type { D0Fixture } from "@huoqiu/contracts/d0";
import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageState } from "./page-state";
import { ScreenHeader } from "./screen-header";

export type D0Instrument = D0Fixture["instruments"][number];

export const searchD0Listings = (
  query: string,
  fixture: D0Fixture,
): readonly D0Instrument[] => {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (normalized.length === 0) {
    return [];
  }

  return fixture.instruments.filter((instrument) =>
    [
      instrument.symbol,
      instrument.name,
      instrument.pinyin,
      ...instrument.aliases,
    ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized)),
  );
};

type InstrumentSearchProperties = Readonly<{
  fixture: D0Fixture;
  query: string;
  state: "normal" | "loading" | "empty" | "error";
  onQueryChange?: ((query: string) => void) | undefined;
  onSubmit?: (() => void) | undefined;
  onOpenInstrument?: ((listingId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
}>;

export function InstrumentSearch({
  fixture,
  query,
  state,
  onQueryChange,
  onSubmit,
  onOpenInstrument,
  onRetry,
}: InstrumentSearchProperties) {
  const results = searchD0Listings(query, fixture);
  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.viewport}>
      <ScreenHeader subtitle="代码 · 名称 · 拼音 · 别名" title="搜索" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchCard}>
          <Text style={styles.label}>搜索演示标的</Text>
          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="输入演示标的关键词"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={onQueryChange}
              onSubmitEditing={onSubmit}
              placeholder="SYN001 / 合成示例一号"
              placeholderTextColor={tokens.text.disabled}
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onSubmit}
              style={styles.submit}
            >
              <Text style={styles.submitText}>搜索</Text>
            </Pressable>
          </View>
          <Text style={styles.fixtureNotice}>
            当前查询：{query.length === 0 ? "未输入" : query} · 固定 Fixture
          </Text>
        </View>

        <PageState
          emptyMessage="没有可搜索的演示标的"
          errorMessage="演示搜索暂时不可用"
          onRetry={onRetry}
          state={state}
        >
          {!hasQuery ? (
            <PageState state="empty" emptyMessage="请输入演示标的关键词" />
          ) : results.length === 0 ? (
            <PageState state="empty" emptyMessage="没有找到匹配的演示标的" />
          ) : (
            <View style={styles.results}>
              <Text style={styles.resultsLabel}>搜索结果</Text>
              {results.map((instrument) => {
                const quote = fixture.quotes.find(
                  (candidate) => candidate.listing_id === instrument.listing_id,
                );
                return (
                  <Pressable
                    accessibilityHint={instrument.listing_id}
                    accessibilityLabel={`打开${instrument.name}详情`}
                    accessibilityRole="button"
                    key={instrument.listing_id}
                    onPress={() => onOpenInstrument?.(instrument.listing_id)}
                    style={styles.resultRow}
                    testID={`instrument-result-${instrument.listing_id}`}
                  >
                    <View style={styles.resultIdentity}>
                      <Text style={styles.resultName}>{instrument.name}</Text>
                      <Text style={styles.resultSymbol}>
                        {instrument.symbol} · {instrument.market} ·{" "}
                        {instrument.currency}
                      </Text>
                    </View>
                    <View style={styles.resultQuote}>
                      <Text style={styles.resultLast}>
                        {quote?.last ?? "--"}
                      </Text>
                      <Text style={styles.resultChange}>
                        +{quote?.change_pct ?? "--"}%
                      </Text>
                    </View>
                  </Pressable>
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
  searchCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
  },
  label: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  searchRow: {
    flexDirection: "row",
  },
  input: {
    backgroundColor: tokens.surface.canvas,
    borderColor: tokens.surface.divider,
    borderBottomLeftRadius: 12,
    borderTopLeftRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  submit: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderBottomRightRadius: 12,
    borderTopRightRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  submitText: {
    color: tokens.brand.onPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  fixtureNotice: {
    color: tokens.text.tertiary,
    fontSize: 11,
  },
  results: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  resultsLabel: {
    color: tokens.text.tertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    padding: 16,
  },
  resultRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  resultIdentity: {
    flex: 1,
  },
  resultName: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  resultSymbol: {
    color: tokens.text.tertiary,
    fontSize: 11,
    paddingTop: 4,
  },
  resultQuote: {
    alignItems: "flex-end",
  },
  resultLast: {
    color: tokens.market.up,
    fontSize: 16,
    fontWeight: "700",
  },
  resultChange: {
    color: tokens.market.up,
    fontSize: 11,
    paddingTop: 4,
  },
});
