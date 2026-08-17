import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { HotRow, NewsItem, SearchHit } from "../../api/market-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";
import { Sparkline } from "./sparkline";

/*
 * 搜索。
 *
 * 参考图两张：没输入时是「猜你想搜 + 热门股票」（search-entry.png），输入后
 * 是联想列表，命中的那几个字标成橙色（search-suggest.png）。
 *
 * 这一页此前读的是 D0 夹具——一份写死的名单，搜什么都只能搜出那几只。现在
 * 走 /api/market/search，是真的代码表。
 *
 * 「猜你想搜」用当前的实时资讯标题。参考图里那四条也是当下的热点，不是个性化
 * 推荐——我们没有用户的搜索历史，编一份「猜你想搜」出来就是假的。
 */

/** 名称里命中查询的那一段。大小写不敏感，只标第一处。 */
export const splitMatch = (
  name: string,
  query: string,
): Readonly<{ after: string; before: string; match: string }> => {
  const needle = query.trim();
  if (needle.length === 0) return { after: "", before: name, match: "" };
  const at = name.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return { after: "", before: name, match: "" };
  return {
    after: name.slice(at + needle.length),
    before: name.slice(0, at),
    /* 从原串里切，不要直接用 query：大小写得跟着结果走，而不是跟着输入。 */
    match: name.slice(at, at + needle.length),
  };
};

/*
 * 昨收 = 现价 ÷ (1 + 涨跌幅)。榜单里没有单列这一项。
 *
 * 三种情况都回 null，也就是不画基准线：现价或涨跌幅取不到（停牌、无站内页），
 * 以及跌停到 -100% ——那时分母是 0，算出来是 Infinity，画出来是一条飞出图外
 * 的线，而没有任何地方会报错。
 */
const previousCloseOf = (
  row: Readonly<{ changePercent: number | null; last: number | null }>,
): number | null => {
  if (row.last === null || row.changePercent === null) return null;
  if (row.changePercent === -100) return null;
  return row.last / (1 + row.changePercent / 100);
};

export type SearchScreenProperties = Readonly<{
  guesses: readonly NewsItem[] | null;
  hot: readonly HotRow[] | null;
  hotFailure: string | null;
  /** 每只热门股的分时价格，键是 HotRow.href；取不到的那一行就不画走势图。 */
  intraday: ReadonlyMap<string, readonly number[]>;
  onBack: () => void;
  onChangeQuery: (query: string) => void;
  onOpenHot: (href: string) => void;
  onOpenNews: (item: NewsItem) => void;
  onOpenSymbol: (symbol: string) => void;
  onSubmit: () => void;
  query: string;
  /** null 表示还没搜；空数组表示搜过了，确实没有。 */
  results: readonly SearchHit[] | null;
  resultsFailure: string | null;
  searching: boolean;
}>;

export function SearchScreen({
  guesses,
  hot,
  hotFailure,
  intraday,
  onBack,
  onChangeQuery,
  onOpenHot,
  onOpenNews,
  onOpenSymbol,
  onSubmit,
  query,
  results,
  resultsFailure,
  searching,
}: SearchScreenProperties) {
  const insets = useSafeAreaInsets();
  const signColor = useSignColor();
  const typing = query.trim().length > 0;

  return (
    <View style={styles.screen} testID="search-screen">
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <View style={styles.field}>
          <Text style={styles.fieldGlyph}>🔍</Text>
          <TextInput
            autoCorrect={false}
            onChangeText={onChangeQuery}
            onSubmitEditing={onSubmit}
            placeholder="股票 · 代码 · 基金"
            placeholderTextColor={tokens.text.tertiary}
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          {typing ? (
            <Pressable
              accessibilityLabel="清空"
              accessibilityRole="button"
              onPress={() => {
                onChangeQuery("");
              }}
              style={styles.clear}
            >
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={styles.submit}
        >
          <Text style={styles.submitText}>搜索</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.body}
      >
        {typing ? (
          <>
            {resultsFailure === null ? null : (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{resultsFailure}</Text>
              </View>
            )}

            {/*
              「搜不到」和「还在搜」要分开说。混成一句，网慢时每次输入都像是
              「没有这只股票」，用户会换个词重搜，然后一直搜不到。
            */}
            {/*
              「正在搜」此前从头到尾没画出来：这个文件顶上写着「搜不到和还在搜
              要分开说」，而分开之后只说了一半——用户输入时看到的是上一次的
              结果静止不动，没有任何正在搜的迹象。
            */}
            {searching ? (
              <Text style={styles.empty}>正在搜「{query.trim()}」……</Text>
            ) : null}

            {results !== null && results.length === 0 && !searching ? (
              <Text style={styles.empty}>
                没有匹配「{query.trim()}」的标的。
              </Text>
            ) : null}

            {(results ?? []).map((hit) => {
              const parts = splitMatch(hit.name, query);
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={hit.symbol === null}
                  key={`${hit.kind}-${hit.code}`}
                  onPress={() => {
                    if (hit.symbol !== null) onOpenSymbol(hit.symbol);
                  }}
                  style={styles.hitRow}
                >
                  <Text numberOfLines={1} style={styles.hitName}>
                    {parts.before}
                    <Text style={styles.hitMatch}>{parts.match}</Text>
                    {parts.after}
                  </Text>
                  <Text style={styles.hitKind}>{hit.kind}</Text>
                  <Text style={styles.hitCode}>{hit.code}</Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.section}>猜你想搜</Text>
            {guesses === null || guesses.length === 0 ? (
              <Text style={styles.empty}>还没有取到今天的热点。</Text>
            ) : (
              <View style={styles.guesses}>
                {guesses.slice(0, 6).map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() => {
                      onOpenNews(item);
                    }}
                    style={styles.guess}
                  >
                    <Text numberOfLines={1} style={styles.guessText}>
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.section}>热门股票</Text>
            {hotFailure === null ? null : (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{hotFailure}</Text>
              </View>
            )}
            {hot === null ? (
              <Text style={styles.empty}>正在读取榜单……</Text>
            ) : null}
            {(hot ?? []).slice(0, 8).map((row, index) => (
              <Pressable
                accessibilityRole="button"
                /* 没有站内页的市场，href 是 null——那一行不该能点。 */
                disabled={row.href === null}
                key={row.code}
                onPress={() => {
                  if (row.href !== null) onOpenHot(row.href);
                }}
                style={styles.hotRow}
              >
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.hotIdentity}>
                  <Text numberOfLines={1} style={styles.hotName}>
                    {row.name}
                  </Text>
                  <Text style={styles.hotCode}>{row.code}</Text>
                </View>
                <Sparkline
                  previousClose={previousCloseOf(row)}
                  prices={
                    row.href === null ? [] : (intraday.get(row.href) ?? [])
                  }
                />
                <View style={styles.hotChange}>
                  <Text
                    style={[
                      styles.hotPercent,
                      { color: signColor(row.changePercent) },
                    ]}
                  >
                    {signedPercent(row.changePercent)}
                  </Text>
                  <Text style={styles.hotLabel}>涨跌幅</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  clear: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: appTouchMinimum,
  },
  clearText: {
    color: tokens.text.tertiary,
    fontSize: 14,
  },
  content: {
    paddingBottom: 32,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  field: {
    alignItems: "center",
    backgroundColor: tokens.surface.canvas,
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  fieldGlyph: {
    fontSize: 13,
  },
  guess: {
    justifyContent: "center",
    minHeight: appTouchMinimum,
    width: "50%",
  },
  guessText: {
    color: tokens.text.primary,
    fontSize: 15,
  },
  guesses: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
  },
  hitCode: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  hitKind: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 4,
    color: tokens.text.tertiary,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  hitMatch: {
    color: tokens.market.warning,
    fontWeight: "700",
  },
  hitName: {
    color: tokens.text.primary,
    flexShrink: 1,
    fontSize: 16,
  },
  hitRow: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hotChange: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 74,
  },
  hotCode: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  hotIdentity: {
    flex: 1,
    gap: 2,
  },
  hotLabel: {
    color: tokens.text.tertiary,
    fontSize: 11.5,
  },
  hotName: {
    color: tokens.text.primary,
    fontSize: 15.5,
  },
  hotPercent: {
    fontSize: 15,
    fontWeight: "700",
  },
  hotRow: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    minHeight: 36,
  },
  notice: {
    backgroundColor: tokens.market.warningSubtle,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noticeText: {
    color: tokens.market.warningText,
    fontSize: 13,
  },
  rank: {
    color: tokens.text.tertiary,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 16,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  section: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
    paddingBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  submit: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
  },
  submitText: {
    color: tokens.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
  topAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 32,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 26,
    lineHeight: 30,
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
