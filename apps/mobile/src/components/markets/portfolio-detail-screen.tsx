import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { PublicPortfolio, Quote } from "../../api/market-api";
import { appTouchMinimum, touchSlop } from "../../styles/app-touch";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";

/*
 * 组合详情。
 *
 * 这一页此前读的是合成夹具：点站内真实存在的组合，得到的是一句「未找到该合成
 * 组合」——而组合榜上列的正是那些真组合。
 *
 * 现在是真的：持仓、权重、每只的当日涨跌，以及按权重加总的当日收益。成本价
 * 我们没有，所以只报当日，不报「成立以来收益」——那个数字编不出来。
 */

export type PortfolioDetailScreenProperties = Readonly<{
  dayReturn: number | null;
  failure: string | null;
  /** null 表示不显示关注按钮（自己建的，或未登录）。 */
  following: boolean | null;
  onBack: () => void;
  onOpenInstrument: (symbol: string) => void;
  onToggleFollow: () => void;
  /** null 表示还没取到，或这个 id 不存在——由 loaded 区分。 */
  portfolio: PublicPortfolio | null;
  /** 组合榜已经取回来了。为 true 而 portfolio 仍是 null，就是这条不存在。 */
  loaded: boolean;
  quotes: ReadonlyMap<string, Quote>;
}>;

export function PortfolioDetailScreen({
  dayReturn,
  failure,
  following,
  loaded,
  onBack,
  onOpenInstrument,
  onToggleFollow,
  portfolio,
  quotes,
}: PortfolioDetailScreenProperties) {
  const insets = useSafeAreaInsets();
  const signColor = useSignColor();
  const holdings = portfolio?.holdings ?? [];

  return (
    <View style={styles.screen} testID="portfolio-detail-screen">
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.topTitle}>
          {portfolio?.name ?? "组合"}
        </Text>
        {following === null || portfolio === null ? null : (
          <Pressable
            hitSlop={touchSlop(32)}
            accessibilityRole="button"
            onPress={onToggleFollow}
            style={[styles.follow, following ? styles.followOn : null]}
            testID="portfolio-follow"
          >
            <Text style={following ? styles.followTextOn : styles.followText}>
              {following ? "已关注" : "关注"}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        {portfolio === null ? (
          <Text style={styles.empty}>
            {failure !== null
              ? "这个组合打不开。"
              : loaded
                ? "这个组合不在了。"
                : "正在读取组合……"}
          </Text>
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.owner}>
                {portfolio.ownerName === ""
                  ? "已注销账号"
                  : `${portfolio.ownerName} 主理`}
                {portfolio.followerCount > 0
                  ? ` · ${String(portfolio.followerCount)} 人关注`
                  : ""}
              </Text>
              <Text style={styles.returnLabel}>当日收益</Text>
              <Text
                style={[
                  styles.returnValue,
                  { color: signColor(dayReturn ?? 0) },
                ]}
              >
                {dayReturn === null ? "—" : signedPercent(dayReturn)}
              </Text>
              {/*
                只报当日。没有成本价就算不出「成立以来收益」，而那正是这类页面
                上最容易被人当真、也最容易编出来的一个数字。
              */}
              <Text style={styles.returnNote}>
                按持仓权重加总当日涨跌得出。没有成本价，所以不报成立以来的收益。
              </Text>
            </View>

            <Text style={styles.section}>持仓</Text>

            {holdings.length === 0 ? (
              <Text style={styles.empty}>这个组合还没有持仓。</Text>
            ) : null}

            {holdings.map((holding) => {
              const quote = quotes.get(holding.symbol);
              return (
                <Pressable
                  accessibilityRole="button"
                  key={holding.symbol}
                  onPress={() => {
                    onOpenInstrument(holding.symbol);
                  }}
                  style={styles.row}
                >
                  <View style={styles.rowMain}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {quote?.name ?? holding.symbol.toUpperCase()}
                    </Text>
                    <Text style={styles.rowSymbol}>
                      {holding.symbol.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.weight}>
                    {holding.weight.toFixed(2)}%
                  </Text>
                  <Text
                    style={[
                      styles.change,
                      { color: signColor(quote?.changePercent ?? 0) },
                    ]}
                  >
                    {quote === undefined
                      ? "—"
                      : signedPercent(quote.changePercent)}
                  </Text>
                </Pressable>
              );
            })}
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
  change: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "right",
  },
  content: {
    paddingBottom: 32,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  follow: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 16,
  },
  followOn: {
    backgroundColor: tokens.surface.canvas,
  },
  followText: {
    color: tokens.brand.primary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  followTextOn: {
    color: tokens.text.tertiary,
    fontSize: 13.5,
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
  owner: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  returnLabel: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
    paddingTop: 6,
  },
  returnNote: {
    color: tokens.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  returnValue: {
    fontSize: 30,
    fontWeight: "700",
  },
  row: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: tokens.text.primary,
    fontSize: 15.5,
  },
  rowSymbol: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  section: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  summary: {
    backgroundColor: tokens.surface.base,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  topAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 36,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 26,
    lineHeight: 30,
  },
  topTitle: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
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
  weight: {
    color: tokens.text.secondary,
    fontSize: 14,
    minWidth: 64,
    textAlign: "right",
  },
});
