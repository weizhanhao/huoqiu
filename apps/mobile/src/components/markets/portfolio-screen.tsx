import { tokens } from "@huoqiu/native-ui";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Portfolio, PortfolioSets } from "../../api/market-api";

/*
 * 组合。
 *
 * 这一页原先读的是 getPortfolioHub(period)——一份写死的合成榜单，切「日/周/年」
 * 只是在几组假收益之间来回换。现在是这个账号自己建的和关注的组合。
 */

export type PortfolioScreenProperties = Readonly<{
  failure: string | null;
  loading: boolean;
  onRefresh: () => void;
  sets: PortfolioSets | null;
  signedIn: boolean;
}>;

const Section = ({
  empty,
  rows,
  title,
}: Readonly<{ empty: string; rows: readonly Portfolio[]; title: string }>) => (
  <>
    <Text style={styles.sectionHeading}>{title}</Text>
    {rows.length === 0 ? (
      <Text style={styles.empty}>{empty}</Text>
    ) : (
      rows.map((portfolio) => (
        <View key={portfolio.id} style={styles.card}>
          <Text style={styles.name}>{portfolio.name}</Text>
          {/*
            持仓只报只数，不在这一页算收益。没有成本价就算不出真实收益，
            凑一个出来比不给更糟。
          */}
          <Text style={styles.note}>
            {portfolio.holdings === undefined
              ? "暂无持仓"
              : `${String(portfolio.holdings.length)} 只持仓`}
          </Text>
        </View>
      ))
    )}
  </>
);

export function PortfolioScreen({
  failure,
  loading,
  onRefresh,
  sets,
  signedIn,
}: PortfolioScreenProperties) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="portfolio-screen"
    >
      <Text style={styles.heading}>组合</Text>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      {signedIn ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            登录后这里会显示你建的和关注的组合，和网页版是同一份。
          </Text>
        </View>
      )}

      {signedIn && sets !== null ? (
        <>
          <Section
            empty="还没有建过组合。在网页版可以新建。"
            rows={sets.created}
            title="我建的"
          />
          <Section
            empty="还没有关注任何组合。"
            rows={sets.followed}
            title="我关注的"
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  content: {
    gap: 10,
    padding: 16,
    paddingBottom: 36,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  heading: {
    color: tokens.text.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  name: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  note: {
    color: tokens.text.tertiary,
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
