import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 首页蓝色头部。
 *
 * 参考图（tab-follow-empty.png）里这一条是蓝色渐变，搜索框、AI、＋、信封都浮在
 * 上面；我们此前是白底，产品的第一印象就完全不同。
 *
 * 这里用纯色而不是渐变：RN 做渐变要装 expo-linear-gradient，而 Expo Go 内置的
 * 模块里没有它——加了这个包，工程就再也不能用 Expo Go 打开，而用户现在正是
 * 靠 Expo Go 预览的。等改成开发构建再换成真渐变。
 */

export type AppHeaderProperties = Readonly<{
  /** 「问AI」——我们不做，点了如实说。 */
  onAskAi: () => void;
  /** 搜索框里显示的热搜词。取不到时给固定占位，别留一个空框。 */
  hotQuery: string | null;
  onOpenMessages: () => void;
  onOpenPublish: () => void;
  onOpenSearch: () => void;
}>;

export function AppHeader({
  hotQuery,
  onAskAi,
  onOpenMessages,
  onOpenPublish,
  onOpenSearch,
}: AppHeaderProperties) {
  return (
    <View style={styles.root} testID="app-header">
      <Pressable
        accessibilityLabel="搜索"
        accessibilityRole="button"
        onPress={onOpenSearch}
        style={styles.search}
      >
        <Text style={styles.searchIcon}>⌕</Text>
        {/*
          搜索框里放热搜词是参考图的做法：它同时是入口和内容，让人一眼看到
          现在大家在看什么。取不到就给固定占位。
        */}
        <Text numberOfLines={1} style={styles.searchText}>
          {hotQuery ?? "搜索代码、名称或拼音首字母"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="问AI"
        accessibilityRole="button"
        onPress={onAskAi}
        style={styles.action}
      >
        <Text style={styles.actionGlyph}>AI</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="发帖"
        accessibilityRole="button"
        onPress={onOpenPublish}
        style={styles.action}
      >
        <Text style={styles.actionGlyph}>＋</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="消息"
        accessibilityRole="button"
        onPress={onOpenMessages}
        style={styles.action}
      >
        <Text style={styles.actionGlyph}>✉</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.55)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  actionGlyph: {
    color: tokens.brand.onPrimary,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 18,
  },
  root: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  search: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    /* 搜索框本身就是主入口，给足触控高度。 */
    minHeight: appTouchMinimum - 6,
    paddingHorizontal: 14,
  },
  searchIcon: {
    color: tokens.text.tertiary,
    fontSize: 15,
  },
  searchText: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 14,
  },
});
