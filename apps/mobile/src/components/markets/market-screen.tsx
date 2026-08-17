import { tokens } from "@huoqiu/native-ui";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MarketOverview, Sector } from "../../api/market-api";
import { signColor, signedPercent } from "../../styles/market-sign";

/*
 * 行情。
 *
 * 这一页原先读的是 synthetic-fixture 里写死的板块和指数。现在是公开行情源的
 * 真实数据：指数、涨跌家数、行业与概念板块。
 */

export type MarketScreenProperties = Readonly<{
  failure: string | null;
  loading: boolean;
  onRefresh: () => void;
  overview: MarketOverview | null;
}>;

const SectorRows = ({ rows }: Readonly<{ rows: readonly Sector[] }>) => (
  <View style={styles.card}>
    {rows.slice(0, 8).map((sector) => (
      <View key={sector.code} style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{sector.name}</Text>
          {/*
            领涨股是这一行里唯一具体的东西。只给一个板块涨幅，看的人下一句
            一定是「谁带起来的」。
          */}
          <Text style={styles.rowNote}>
            领涨 {sector.leaderName} · {sector.advancing} 涨 / {sector.declining}{" "}
            跌
          </Text>
        </View>
        <Text
          style={[styles.rowValue, { color: signColor(sector.changePercent) }]}
        >
          {signedPercent(sector.changePercent)}
        </Text>
      </View>
    ))}
  </View>
);

export function MarketScreen({
  failure,
  loading,
  onRefresh,
  overview,
}: MarketScreenProperties) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="market-screen"
    >
      <View style={styles.heading}>
        <Text style={styles.headingText}>行情</Text>
        {/*
          延时要标出来。不标的话，看的人会按逐笔实时去用这些数字，而它们不是。
        */}
        {overview?.delayed === true ? (
          <Text style={styles.badge}>延时行情</Text>
        ) : null}
      </View>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      {overview === null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {loading ? "正在读取行情……" : "还没有取到行情，下拉重试。"}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.indexGrid}>
            {overview.indexes.slice(0, 6).map((index) => (
              <View key={index.symbol} style={styles.indexCard}>
                <Text style={styles.indexName}>{index.name}</Text>
                <Text
                  style={[
                    styles.indexLast,
                    { color: signColor(index.changePercent) },
                  ]}
                >
                  {index.last.toFixed(2)}
                </Text>
                <Text
                  style={[
                    styles.indexChange,
                    { color: signColor(index.changePercent) },
                  ]}
                >
                  {signedPercent(index.changePercent)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.breadth}>
            <Text style={[styles.breadthCell, { color: tokens.market.upText }]}>
              {overview.breadth.advancing} 涨
            </Text>
            <Text style={styles.breadthCell}>
              {overview.breadth.unchanged} 平
            </Text>
            <Text
              style={[styles.breadthCell, { color: tokens.market.downText }]}
            >
              {overview.breadth.declining} 跌
            </Text>
          </View>

          <Text style={styles.sectionHeading}>行业板块</Text>
          <SectorRows rows={overview.industries} />

          <Text style={styles.sectionHeading}>概念板块</Text>
          <SectorRows rows={overview.concepts} />

          <Text style={styles.disclosure}>
            数据来自公开行情接口 · 不构成投资建议
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: tokens.market.warningSubtle,
    borderRadius: 999,
    color: tokens.market.warningText,
    fontSize: 12,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  breadth: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    paddingVertical: 12,
  },
  breadthCell: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
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
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headingText: {
    color: tokens.text.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  indexCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
    padding: 12,
  },
  indexChange: {
    fontSize: 13,
    fontWeight: "600",
  },
  indexGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  indexLast: {
    fontSize: 20,
    /* 数字要对齐，不然一列指数看着像在抖。 */
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  indexName: {
    color: tokens.text.secondary,
    fontSize: 13,
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
  row: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  rowNote: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  rowValue: {
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  sectionHeading: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 6,
  },
});
