import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Quote } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import {
  fixedOrMissing,
  signedAmount,
  signedPercent,
} from "../../styles/market-sign";

/*
 * 自选。
 *
 * 名单存在服务端（/api/social/watchlist），所以和网页版是同一份——手机上加的
 * 自选，电脑上打开就在。行情按名单现取。
 */

export type WatchlistScreenProperties = Readonly<{
  failure: string | null;
  loading: boolean;
  onOpenInstrument: (symbol: string) => void;
  onRefresh: () => void;
  quotes: readonly Quote[];
  signedIn: boolean;
  /** 名单本身。行情可能还没回来，但「有几只」应该立刻能说。 */
  symbols: readonly string[];
}>;

export function WatchlistScreen({
  failure,
  loading,
  onOpenInstrument,
  onRefresh,
  quotes,
  signedIn,
  symbols,
}: WatchlistScreenProperties) {
  const signColor = useSignColor();
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="watchlist-screen"
    >
      <Text style={styles.heading}>自选</Text>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      {signedIn ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            登录后这里会显示你的自选。自选存在账号上，手机和网页是同一份。
          </Text>
        </View>
      )}

      {signedIn && symbols.length === 0 && failure === null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            还没有自选。搜一只票、点进去按「加自选」，这里就会出现。
          </Text>
        </View>
      ) : null}

      {/*
        整行可点进个股页。
        
        这一行此前是 View：自选是核心页签，加进来的票在这儿列着，却一只都点
        不进去——用户只能回搜索里再搜一遍。
      */}
      {symbols.map((symbol) => {
        const quote = bySymbol.get(symbol);
        return (
          <Pressable
            accessibilityRole="button"
            key={symbol}
            onPress={() => {
              onOpenInstrument(symbol);
            }}
            style={styles.row}
          >
            <View style={styles.rowMain}>
              {/*
                取不到价时显示代码而不是留空：至少让人知道这一行是哪只票，
                而不是对着一片空白猜。
              */}
              <Text style={styles.name}>{quote?.name ?? symbol}</Text>
              <Text style={styles.symbol}>{symbol}</Text>
            </View>
            {quote === undefined ? (
              <Text style={styles.pending}>取不到价</Text>
            ) : (
              <View style={styles.rowValues}>
                <Text
                  style={[
                    styles.last,
                    { color: signColor(quote.changePercent) },
                  ]}
                >
                  {/*
                    停牌、退市、上游临时缺这一只，价就是空的。写 0.00 的话，
                    自选列表里会出现一只「跌到零」的票。
                  */}
                  {fixedOrMissing(quote.last, 2)}
                </Text>
                <Text
                  style={[
                    styles.change,
                    { color: signColor(quote.changePercent) },
                  ]}
                >
                  {signedAmount(quote.changeAmount)}{" "}
                  {signedPercent(quote.changePercent)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}

      {symbols.length === 0 ? null : (
        <Text style={styles.disclosure}>行情来自公开接口 · 不构成投资建议</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  change: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  content: {
    /* 行之间不留缝：分隔靠细线，分节靠 8pt 灰带。 */
    paddingBottom: 36,
  },
  disclosure: {
    paddingHorizontal: 16,
    paddingTop: 12,
    color: tokens.text.tertiary,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  heading: {
    color: tokens.text.primary,
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 22,
    fontWeight: "700",
  },
  last: {
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  name: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  pending: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  row: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    /*
     * 通栏白行 + 组内细线，不是圆角描边卡。
     *
     * 参考图这几屏都是这个结构：白底铺满、行与行之间一条从文字左缘起的 1px
     * 细线、区块之间一条 8pt 灰带。做成一张张描边卡之后，同样一屏高度只能放
     * 下更少的行，还显得空——这就是「密度差距」的具体来源。
     */
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowValues: {
    alignItems: "flex-end",
    gap: 2,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
});
