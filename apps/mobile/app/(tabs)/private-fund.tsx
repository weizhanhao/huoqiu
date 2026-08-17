import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchPrivateFundManagers } from "../../src/api/market-api";
import { EntryGrid } from "../../src/components/shell/entry-grid";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { appTouchMinimum } from "../../src/styles/app-touch";

/*
 * 私募页签。
 *
 * 形态照参考图（tab-private-fund.png）：深色主视觉、一排入口、下面是列表。
 *
 * 内容换成了真实可核的东西：中基协公示的私募管理人。参考图上那些「解锁可见」
 * 的产品收益要资质才能展示，我们不做；管理人信息是公开的，每条都能回中基协
 * 原页核对——这比印一堆看不见的收益数字有用。
 */
export default function PrivateFundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useComingSoon();
  const { failure, loading, refresh, value } = useRemote(
    fetchPrivateFundManagers,
  );

  const locked = (title: string, detail: string) => () => {
    show(title, detail);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={
        <RefreshControl onRefresh={refresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="private-fund-screen"
    >
      <View style={styles.hero}>
        <View style={styles.heroHead}>
          <Text style={styles.heroTitle}>私募</Text>
          <Pressable
            accessibilityLabel="搜索"
            accessibilityRole="button"
            onPress={() => router.push("/search")}
            style={styles.headAction}
          >
            <Text style={styles.heroGlyph}>⌕</Text>
          </Pressable>
        </View>
        <Text style={styles.heroLede}>
          中基协公示的私募基金管理人，每条都可回原页核对。
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={locked(
            "专属财富顾问",
            "1 对 1 顾问与产品配置需要资质，本站不提供。",
          )}
          style={styles.heroAction}
        >
          <Text style={styles.heroActionText}>专属财富顾问 1 对 1</Text>
        </Pressable>
      </View>

      <EntryGrid
        entries={[
          {
            glyph: "①",
            label: "私募榜单",
            onPress: locked("私募榜单", "业绩榜单要产品净值数据，本站没有。"),
          },
          {
            glyph: "¥",
            label: "全部产品",
            onPress: locked("全部产品", "产品与申购需要资质，本站不提供。"),
          },
          {
            glyph: "✓",
            label: "新品私募",
            onPress: locked("新品私募", "同上，涉及产品销售，不做。"),
          },
          {
            glyph: "★",
            label: "多策略",
            onPress: locked("多策略私募", "策略分类展示还没做。"),
          },
          {
            glyph: "◇",
            label: "低波稳健",
            onPress: locked("低波稳健", "同上，还没做。"),
          },
        ]}
      />

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      <Text style={styles.section}>私募管理人</Text>

      {value === null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {loading ? "正在读取管理人……" : "还没有取到管理人，下拉重试。"}
          </Text>
        </View>
      ) : value.length === 0 ? (
        /* 服务端正常返回但名单是空的：不写一句，屏幕上就是一段莫名的空白。 */
        <View style={styles.notice}>
          <Text style={styles.noticeText}>没有取到管理人名单。</Text>
        </View>
      ) : (
        /*
          这一页写着「每条都可回原页核对」，而这一行此前是 View——真想去核对的
          人在上面戳几下，什么都不会发生。承诺要兑现。
        */
        value.slice(0, 20).map((manager) => (
          <Pressable
            accessibilityRole="button"
            key={manager.disclosureUrl}
            onPress={() => {
              void Linking.openURL(manager.disclosureUrl);
            }}
            style={styles.row}
          >
            <Text style={styles.name}>{manager.name}</Text>
            <Text style={styles.meta}>
              {manager.investType} · 法定代表人 {manager.legalPerson}
            </Text>
            <Text style={styles.meta}>
              成立 {manager.establishedOn} · 在管 {manager.fundCount} 只 ·
              点击在中基协核对
            </Text>
          </Pressable>
        ))
      )}

      <Text style={styles.disclosure}>
        管理人信息来自中国证券投资基金业协会公示 · 不构成投资建议 ·
        本站不提供私募产品销售
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    /* 行是通栏的，左右留白由每一行自己给。 */
    gap: 0,
    paddingBottom: 36,
  },
  disclosure: {
    paddingHorizontal: 16,
    color: tokens.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: "center",
  },
  headAction: {
    alignItems: "center",
    height: appTouchMinimum,
    justifyContent: "center",
    width: appTouchMinimum,
  },
  hero: {
    backgroundColor: "#123A6B",
    borderRadius: 14,
    gap: 8,
    padding: 16,
  },
  heroAction: {
    alignItems: "center",
    backgroundColor: "#D9B98A",
    borderRadius: 999,
    justifyContent: "center",
    marginTop: 4,
    minHeight: appTouchMinimum,
  },
  heroActionText: {
    color: "#3A2A12",
    fontSize: 15,
    fontWeight: "700",
  },
  heroGlyph: {
    color: "#FFFFFF",
    fontSize: 19,
  },
  heroHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroLede: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13.5,
    lineHeight: 20,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
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
  row: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    gap: 3,
    padding: 14,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
});
