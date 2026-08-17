import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  Portfolio,
  PortfolioSets,
  PublicPortfolio,
} from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";

/*
 * 组合。
 *
 * 这一页原先读的是 getPortfolioHub(period)——一份写死的合成榜单，切「日/周/年」
 * 只是在几组假收益之间来回换。现在有两块真东西：站内所有账号建过的组合按当日
 * 收益排的擂台榜，和这个账号自己建的、关注的组合。
 *
 * 参考图里擂台榜有日榜/周榜/年榜三档。这里只有日榜——我们没有存过组合的历史
 * 净值，周和年算不出来。画上另外两档，点开只能是空的或者编的。
 */

/** 一行榜单：组合本身，加上算出来的当日收益（取不到为 null）。 */
export type BoardRow = Readonly<{
  dayReturn: number | null;
  portfolio: PublicPortfolio;
}>;

export type PortfolioScreenProperties = Readonly<{
  /** null 表示还没取到。 */
  board: readonly BoardRow[] | null;
  boardFailure: string | null;
  failure: string | null;
  loading: boolean;
  onOpenPortfolio: (portfolioId: string) => void;
  onRefresh: () => void;
  sets: PortfolioSets | null;
  signedIn: boolean;
}>;

const Section = ({
  empty,
  onOpen,
  rows,
  title,
}: Readonly<{
  empty: string;
  onOpen: (portfolioId: string) => void;
  rows: readonly Portfolio[];
  title: string;
}>) => (
  <>
    <Text style={styles.sectionHeading}>{title}</Text>
    {rows.length === 0 ? (
      <Text style={styles.empty}>{empty}</Text>
    ) : (
      /*
        卡片此前是 View，点不动：好不容易建成一个组合，在「我建的」里看到它，
        想看持仓却只能回擂台榜里翻找自己那一条。
      */
      rows.map((portfolio) => (
        <Pressable
          accessibilityRole="button"
          key={portfolio.id}
          onPress={() => {
            onOpen(portfolio.id);
          }}
          style={styles.card}
        >
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
        </Pressable>
      ))
    )}
  </>
);

export function PortfolioScreen({
  board,
  boardFailure,
  failure,
  loading,
  onOpenPortfolio,
  onRefresh,
  sets,
  signedIn,
}: PortfolioScreenProperties) {
  const signColor = useSignColor();
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

      <Text style={styles.sectionHeading}>火球组合擂台榜 · 日榜</Text>
      {boardFailure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{boardFailure}</Text>
        </View>
      )}
      {board === null ? <Text style={styles.empty}>正在读取榜单……</Text> : null}
      {board !== null && board.length === 0 ? (
        <Text style={styles.empty}>
          还没有人建过组合。建一个，它就会出现在这里。
        </Text>
      ) : null}
      {(board ?? []).map((row, rank) => (
        <Pressable
          accessibilityRole="button"
          key={row.portfolio.id}
          onPress={() => {
            onOpenPortfolio(row.portfolio.id);
          }}
          style={styles.boardRow}
        >
          <Text style={styles.rank}>{rank + 1}</Text>
          <View style={styles.boardMain}>
            <Text numberOfLines={1} style={styles.name}>
              {row.portfolio.name}
            </Text>
            <Text style={styles.note}>
              {row.portfolio.ownerName === ""
                ? "已注销账号"
                : `${row.portfolio.ownerName} 主理`}
              {row.portfolio.followerCount > 0
                ? ` · ${String(row.portfolio.followerCount)} 人关注`
                : ""}
            </Text>
          </View>
          <View style={styles.boardReturn}>
            <Text style={styles.note}>日收益</Text>
            {/*
              取不到行情就写「—」。少算一只的加权和是错的，而错的结果看起来
              仍然像个正常的百分比，还会被拿去比名次。
            */}
            <Text
              style={[
                styles.returnValue,
                { color: signColor(row.dayReturn ?? 0) },
              ]}
            >
              {row.dayReturn === null ? "—" : signedPercent(row.dayReturn)}
            </Text>
          </View>
        </Pressable>
      ))}

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
            empty="还没有建过组合。点右上角的「新建组合」就能建一个。"
            onOpen={onOpenPortfolio}
            rows={sets.created}
            title="我建的"
          />
          <Section
            empty="还没有关注任何组合。在上面的擂台榜里点进一个，可以关注。"
            onOpen={onOpenPortfolio}
            rows={sets.followed}
            title="我关注的"
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardMain: {
    flex: 1,
    gap: 3,
  },
  boardReturn: {
    alignItems: "flex-end",
    gap: 2,
  },
  boardRow: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    /* 通栏白行 + 组内细线，与参考图一致（见 watchlist-screen 的说明）。 */
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    gap: 0,
    paddingBottom: 36,
  },
  empty: {
    paddingHorizontal: 16,
    color: tokens.text.secondary,
    fontSize: 14,
  },
  heading: {
    paddingHorizontal: 16,
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
  rank: {
    color: tokens.text.tertiary,
    fontSize: 15,
    fontWeight: "700",
    minWidth: 18,
  },
  returnValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  sectionHeading: {
    paddingHorizontal: 16,
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 6,
  },
});
