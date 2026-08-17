import { tokens } from "@huoqiu/native-ui";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 首页频道条。
 *
 * 参考图里这一条横向可滑，末尾一个「☰」打开频道管理弹层，可增删与排序。
 * 频道是首页的骨架——没有它，首页就只是一条信息流。
 */

export type ChannelId =
  | "etf"
  | "follow"
  | "fund"
  | "hot"
  | "news"
  | "private"
  | "recommend"
  | "star"
  | "video"
  | "watchlist";

export const allChannels: readonly Readonly<{
  id: ChannelId;
  label: string;
}>[] = [
  { id: "follow", label: "关注" },
  { id: "recommend", label: "推荐" },
  { id: "hot", label: "热门" },
  { id: "video", label: "视频" },
  { id: "watchlist", label: "自选" },
  { id: "fund", label: "基金" },
  { id: "news", label: "资讯" },
  { id: "star", label: "达人" },
  { id: "private", label: "私募" },
  { id: "etf", label: "ETF" },
];

/*
 * 关注和推荐不可移除。
 *
 * 参考图的频道管理里这两个是灰的、点不动——它们是产品的默认入口，全删光之后
 * 首页会是一片空白，而用户未必想得到「去频道管理里加回来」。
 */
const permanent = new Set<ChannelId>(["follow", "recommend"]);

const labelOf = (id: ChannelId): string =>
  allChannels.find((channel) => channel.id === id)?.label ?? id;

export type ChannelBarProperties = Readonly<{
  active: ChannelId;
  managing: boolean;
  onChangeSelected: (next: readonly ChannelId[]) => void;
  onCloseManager: () => void;
  onOpenManager: () => void;
  onSelect: (id: ChannelId) => void;
  selected: readonly ChannelId[];
}>;

export function ChannelBar({
  active,
  managing,
  onChangeSelected,
  onCloseManager,
  onOpenManager,
  onSelect,
  selected,
}: ChannelBarProperties) {
  const unselected = allChannels
    .map(({ id }) => id)
    .filter((id) => !selected.includes(id));

  return (
    <View style={styles.root} testID="channel-bar">
      <ScrollView
        contentContainerStyle={styles.strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.stripScroll}
      >
        {selected.map((id) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: id === active }}
            key={id}
            onPress={() => {
              onSelect(id);
            }}
            style={styles.tab}
          >
            <Text style={id === active ? styles.tabTextActive : styles.tabText}>
              {labelOf(id)}
            </Text>
            {/* 选中态用下划线而不是色块：参考图就是这么做的，也更不抢眼。 */}
            {id === active ? <View style={styles.underline} /> : null}
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        accessibilityLabel="频道管理"
        accessibilityRole="button"
        onPress={onOpenManager}
        style={styles.manage}
      >
        <Text style={styles.manageGlyph}>☰</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={onCloseManager}
        transparent
        visible={managing}
      >
        <Pressable
          accessibilityLabel="关闭频道管理"
          accessibilityRole="button"
          onPress={onCloseManager}
          style={styles.backdrop}
        >
          {/*
            弹层本体要拦住触摸。RN 里非交互的 View 不阻断冒泡：点「已选频道」
            下面的空白处会一路冒到背景上把弹层关掉，用户以为自己点错了。

            accessible={false}：这一层不是给人按的，只是块挡板。不写的话它照样
            进无障碍树，读屏念出来是一个没有名字的按钮，罩住整张抽屉——聚焦到
            它、按下去，什么也不会发生。
          */}
          <Pressable
            accessible={false}
            onPress={() => {
              /* 只为拦住冒泡。 */
            }}
            style={styles.sheet}
            testID="channel-manager"
          >
            <View style={styles.sheetHead}>
              <Pressable
                accessibilityLabel="关闭"
                accessibilityRole="button"
                onPress={onCloseManager}
                style={styles.sheetClose}
              >
                <Text style={styles.sheetCloseGlyph}>✕</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>频道管理</Text>
              <View style={styles.sheetClose} />
            </View>

            <Text style={styles.sheetSection}>已选频道</Text>
            <View style={styles.grid}>
              {selected.map((id) => {
                const fixed = permanent.has(id);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: fixed }}
                    disabled={fixed}
                    key={id}
                    onPress={() => {
                      onChangeSelected(selected.filter((kept) => kept !== id));
                    }}
                    style={[styles.chip, fixed ? styles.chipFixed : null]}
                  >
                    <Text
                      style={fixed ? styles.chipTextFixed : styles.chipText}
                    >
                      {labelOf(id)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sheetSection}>未选频道</Text>
            {unselected.length === 0 ? (
              <Text style={styles.sheetEmpty}>频道都已添加。</Text>
            ) : (
              <View style={styles.grid}>
                {unselected.map((id) => (
                  <Pressable
                    accessibilityRole="button"
                    key={id}
                    onPress={() => {
                      onChangeSelected([...selected, id]);
                    }}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>＋ {labelOf(id)}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/*
              参考图上写的是「长按拖拽排序」。拖拽还没做，这里如实说明现在是
              怎么排的，而不是印一句做不到的提示——印了才是骗人。
            */}
            <Text style={styles.sheetNote}>
              点已选频道移除，点未选频道添加。新增的排在最后；关注与推荐不可移除。
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(16, 22, 31, 0.35)",
    flex: 1,
    justifyContent: "flex-end",
  },
  chip: {
    alignItems: "center",
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    flexBasis: "22%",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 6,
  },
  chipFixed: {
    opacity: 0.5,
  },
  chipText: {
    color: tokens.text.primary,
    fontSize: 14,
  },
  chipTextFixed: {
    color: tokens.text.tertiary,
    fontSize: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  manage: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    height: appTouchMinimum,
    justifyContent: "center",
    minWidth: appTouchMinimum,
  },
  manageGlyph: {
    color: tokens.text.secondary,
    fontSize: 17,
  },
  root: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  sheet: {
    backgroundColor: tokens.surface.base,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetClose: {
    alignItems: "center",
    height: appTouchMinimum,
    justifyContent: "center",
    width: appTouchMinimum,
  },
  sheetCloseGlyph: {
    color: tokens.text.secondary,
    fontSize: 17,
  },
  sheetEmpty: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  sheetHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetNote: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
    lineHeight: 19,
  },
  sheetSection: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  sheetTitle: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  strip: {
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 14,
  },
  stripScroll: {
    flex: 1,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  tabText: {
    color: tokens.text.secondary,
    fontSize: 16,
  },
  tabTextActive: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  underline: {
    backgroundColor: tokens.text.primary,
    borderRadius: 2,
    bottom: 4,
    height: 3,
    position: "absolute",
    width: 16,
  },
});
