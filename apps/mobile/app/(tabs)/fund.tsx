import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchFundList,
  type FundCategory,
  type FundSort,
} from "../../src/api/market-api";
import { EntryGrid } from "../../src/components/shell/entry-grid";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { appTouchMinimum } from "../../src/styles/app-touch";
import {
  fixedOrMissing,
  signColor,
  signedPercent,
} from "../../src/styles/market-sign";

/*
 * 基金页签。
 *
 * 形态照参考图（tab-fund.png）：顶部一排图标入口，下面是分类基金列表。
 * 但不涉及交易——申购、开户、投顾这些入口保留形态，点了如实说「暂未开放」。
 *
 * 数据复用网页版现成的 /api/funds/list，没有另建接口。
 */

const categories = [
  { id: "index", label: "指数型" },
  { id: "stock", label: "股票型" },
  { id: "hybrid", label: "混合型" },
  { id: "bond", label: "债券型" },
  { id: "qdii", label: "QDII" },
] as const satisfies readonly Readonly<{ id: FundCategory; label: string }>[];

const sorts = [
  { id: "oneYear", label: "近一年" },
  { id: "threeYear", label: "近三年" },
  { id: "yearToDate", label: "今年来" },
  { id: "day", label: "日涨幅" },
] as const satisfies readonly Readonly<{ id: FundSort; label: string }>[];

export default function FundScreen() {
  const router = useRouter();
  const { show } = useComingSoon();
  const [category, setCategory] = useState<FundCategory>("index");
  const [sort, setSort] = useState<FundSort>("oneYear");

  const load = useCallback(
    () => fetchFundList(category, sort),
    [category, sort],
  );
  const { failure, loading, refresh, value } = useRemote(load);

  const locked = (title: string, detail: string) => () => {
    show(title, detail);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={refresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="fund-screen"
    >
      <View style={styles.head}>
        <Text style={styles.title}>基金</Text>
        <Pressable
          accessibilityLabel="搜索"
          accessibilityRole="button"
          onPress={() => router.push("/search")}
          style={styles.headAction}
        >
          <Text style={styles.headGlyph}>⌕</Text>
        </Pressable>
      </View>

      <EntryGrid
        entries={[
          {
            badge: "HOT",
            glyph: "◔",
            label: "养老专区",
            onPress: locked(
              "养老专区",
              "个人养老金账户与专区产品。涉及开户，本站不做。",
            ),
          },
          {
            glyph: "▤",
            label: "极速开户",
            onPress: locked("极速开户", "开户需要券商资质，本站不提供。"),
          },
          {
            glyph: "◎",
            label: "指数估值",
            onPress: locked("指数估值", "各宽基指数的估值分位。这一块还没做。"),
          },
          {
            glyph: "⌸",
            label: "基金筛选",
            onPress: locked(
              "基金筛选",
              "按类型、规模、经理年限筛基金。这一块还没做。",
            ),
          },
          {
            glyph: "☺",
            label: "投顾管家",
            onPress: locked("投顾管家", "投顾需要资质，本站不提供。"),
          },
        ]}
      />

      <View style={styles.filters}>
        <View style={styles.chips}>
          {categories.map(({ id, label }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: id === category }}
              key={id}
              onPress={() => {
                setCategory(id);
              }}
              style={[styles.chip, id === category ? styles.chipOn : null]}
            >
              <Text
                style={id === category ? styles.chipTextOn : styles.chipText}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chips}>
          {sorts.map(({ id, label }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: id === sort }}
              key={id}
              onPress={() => {
                setSort(id);
              }}
              style={[styles.chip, id === sort ? styles.chipOn : null]}
            >
              <Text style={id === sort ? styles.chipTextOn : styles.chipText}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      {value === null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {loading ? "正在读取基金……" : "还没有取到基金，下拉重试。"}
          </Text>
        </View>
      ) : (
        value.slice(0, 30).map((fund) => (
          <View key={fund.code} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{fund.name}</Text>
              <Text style={styles.meta}>
                {fund.category} · {fund.code} · 净值 {fixedOrMissing(fund.nav, 4)}（
                {fund.navDate}）
              </Text>
            </View>
            <View style={styles.rowValues}>
              <Text style={[styles.pct, { color: signColor(fund.oneYearPct) }]}>
                {signedPercent(fund.oneYearPct)}
              </Text>
              <Text style={styles.pctLabel}>近一年</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.disclosure}>
        数据来自公开接口 · 不构成投资建议 · 本站不提供申购与赎回
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 14,
  },
  chipOn: {
    backgroundColor: tokens.brand.subtle,
    borderColor: tokens.brand.primary,
  },
  chipText: {
    color: tokens.text.secondary,
    fontSize: 13.5,
  },
  chipTextOn: {
    color: tokens.brand.primary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 36,
  },
  disclosure: {
    color: tokens.text.tertiary,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  filters: {
    gap: 8,
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headAction: {
    alignItems: "center",
    height: appTouchMinimum,
    justifyContent: "center",
    width: appTouchMinimum,
  },
  headGlyph: {
    color: tokens.text.primary,
    fontSize: 19,
  },
  meta: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  name: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    padding: 16,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  pct: {
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  pctLabel: {
    color: tokens.text.tertiary,
    fontSize: 11.5,
  },
  row: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowValues: {
    alignItems: "flex-end",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 22,
    fontWeight: "700",
  },
});
