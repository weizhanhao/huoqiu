import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 图标入口排。
 *
 * 基金页和私募页顶部都是这么一排图标入口（养老专区、极速开户、指数估值……）。
 * 两页各写一遍的话，格子宽度和换行规则迟早会不一致。
 */

export type Entry = Readonly<{
  /** 角标，如 HOT。没有就不显示。 */
  badge?: string;
  glyph: string;
  label: string;
  onPress: () => void;
}>;

export function EntryGrid({
  columns = 5,
  entries,
}: Readonly<{ columns?: number; entries: readonly Entry[] }>) {
  /* 百分比留 1% 给间隙，否则最后一列会被 gap 挤到下一行。 */
  const basis: `${number}%` = `${Math.floor(100 / columns) - 1}%`;

  return (
    <View style={styles.grid} testID="entry-grid">
      {entries.map(({ badge, glyph, label, onPress }) => (
        <Pressable
          accessibilityRole="button"
          key={label}
          onPress={onPress}
          style={[styles.entry, { flexBasis: basis }]}
        >
          <View style={styles.iconWrap}>
            <Text style={styles.glyph}>{glyph}</Text>
            {badge === undefined ? null : (
              <Text style={styles.badge}>{badge}</Text>
            )}
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: tokens.market.up,
    borderRadius: 6,
    color: tokens.brand.onPrimary,
    fontSize: 9,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: "absolute",
    right: -8,
    top: -4,
  },
  entry: {
    alignItems: "center",
    flexGrow: 1,
    gap: 6,
    minHeight: appTouchMinimum,
    paddingVertical: 6,
  },
  glyph: {
    color: tokens.brand.primary,
    fontSize: 22,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  label: {
    color: tokens.text.secondary,
    fontSize: 12,
    textAlign: "center",
  },
});
