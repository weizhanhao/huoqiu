import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 顶部分段头：自选 ｜ 行情 ｜ 组合。
 *
 * 参考图里这三块是同一个页签内部的分段，不是三个底部页签——选中的那个字大而黑，
 * 其余小而灰，右侧一个搜索图标（组合分段还多一个「新建」）。
 *
 * 做成通用件而不是写死三项：组合分段右上角比另外两个多一个按钮，写死的话
 * 迟早要为这一处再复制一份。
 */

export type SegmentHeaderProperties<Id extends string> = Readonly<{
  /** 右侧动作，从左到右排列。 */
  actions?: readonly Readonly<{
    glyph: string;
    label: string;
    onPress: () => void;
  }>[];
  active: Id;
  onSelect: (id: Id) => void;
  segments: readonly Readonly<{ id: Id; label: string }>[];
}>;

export function SegmentHeader<Id extends string>({
  actions = [],
  active,
  onSelect,
  segments,
}: SegmentHeaderProperties<Id>) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]} testID="segment-header">
      <View style={styles.segments}>
        {segments.map(({ id, label }) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: id === active }}
            key={id}
            onPress={() => {
              onSelect(id);
            }}
            style={styles.segment}
          >
            <Text style={id === active ? styles.activeText : styles.text}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {actions.map(({ glyph, label, onPress }) => (
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          key={label}
          onPress={onPress}
          style={styles.action}
        >
          <Text style={styles.actionGlyph}>{glyph}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    height: appTouchMinimum,
    justifyContent: "center",
    width: appTouchMinimum,
  },
  actionGlyph: {
    color: tokens.text.primary,
    fontSize: 19,
  },
  activeText: {
    color: tokens.text.primary,
    /* 参考图实测 20，且选中与未选中同字号——跳字号会让三个词横向重排一次。 */
    fontSize: 20,
    fontWeight: "700",
  },
  root: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    flexDirection: "row",
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  segment: {
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  segments: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 20,
  },
  text: {
    color: tokens.text.tertiary,
    fontSize: 19,
    fontWeight: "600",
  },
});
