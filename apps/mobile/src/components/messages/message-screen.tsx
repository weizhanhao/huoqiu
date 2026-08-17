import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Conversation, Notification } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 消息。
 *
 * 参考图（messages.png）是三张入口卡：回复我的 / 提到我的 / 赞我的，点进去
 * 才是列表。这里把入口和列表放在同一页：三张卡当分类用，下面直接列出那一类的
 * 内容——手机上多一次跳转，只为看见本来就已经取好的东西。
 *
 * 「关注我的」参考图里没有，但服务端在产出，而且它是这几类里最该被看到的。
 * 多一张卡，好过真人关注了却无处可查。
 */

const CATEGORIES = [
  { glyph: "✉", id: "chats", label: "私信" },
  { glyph: "💬", id: "replies", label: "回复我的" },
  { glyph: "@", id: "mentions", label: "提到我的" },
  { glyph: "👍", id: "likes", label: "赞我的" },
  { glyph: "＋", id: "follows", label: "关注我的" },
] as const;

export type MessageCategory = (typeof CATEGORIES)[number]["id"];

const ACTIONS: Readonly<Record<Notification["kind"], string>> = {
  comment: "回复了你的帖子",
  follow: "关注了你",
  like: "赞了你的帖子",
  mention: "提到了你",
  quote: "转发了你的帖子",
};

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export type MessageScreenProperties = Readonly<{
  category: MessageCategory;
  /** 私信会话。null 表示还没取到。 */
  conversations: readonly Conversation[] | null;
  failure: string | null;
  /** null 表示还没取到；空数组表示取到了，确实没有。 */
  notifications: readonly Notification[] | null;
  onBack: () => void;
  onOpen: (notification: Notification) => void;
  onOpenChat: (partnerId: string) => void;
  onSelectCategory: (category: MessageCategory) => void;
  signedIn: boolean;
}>;

export function MessageScreen({
  category,
  conversations,
  failure,
  notifications,
  onBack,
  onOpen,
  onOpenChat,
  onSelectCategory,
  signedIn,
}: MessageScreenProperties) {
  const insets = useSafeAreaInsets();
  const all = notifications ?? [];
  const chats = conversations ?? [];
  const shown = all.filter((entry) => entry.category === category);
  const countOf = (id: MessageCategory): number =>
    id === "chats"
      ? /* 私信那一格显示未读条数，不是会话总数——没读过的才需要被提醒。 */
        chats.reduce((sum, chat) => sum + chat.unread, 0)
      : all.filter((entry) => entry.category === id).length;

  return (
    <View style={styles.screen} testID="message-screen">
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>消息</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        <View style={styles.card}>
          {CATEGORIES.map(({ glyph, id, label }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: id === category }}
              key={id}
              onPress={() => {
                onSelectCategory(id);
              }}
              style={styles.entry}
            >
              <View style={styles.entryIcon}>
                <Text style={styles.entryGlyph}>{glyph}</Text>
              </View>
              <Text
                style={id === category ? styles.entryLabelOn : styles.entryLabel}
              >
                {label}
              </Text>
              {/*
                数字只在有内容时出现。恒挂一个 0 的话，那一列全是 0，
                真有一条时反而看不出来。
              */}
              {countOf(id) > 0 ? (
                <Text style={styles.entryCount}>{countOf(id)}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        {signedIn ? null : (
          <Text style={styles.empty}>登录后才能看到自己的消息。</Text>
        )}

        {signedIn && notifications === null ? (
          <Text style={styles.empty}>正在读取消息……</Text>
        ) : null}

        {signedIn && category === "chats" ? (
          <>
            {conversations === null ? (
              <Text style={styles.empty}>正在读取私信……</Text>
            ) : null}
            {conversations !== null && chats.length === 0 ? (
              <Text style={styles.empty}>
                还没有私信。在别人的主页可以给他发一条。
              </Text>
            ) : null}
            {chats.map((chat) => (
              <Pressable
                accessibilityRole="button"
                key={chat.partnerId}
                onPress={() => {
                  onOpenChat(chat.partnerId);
                }}
                style={styles.row}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {chat.partnerName.slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowHead}>
                    <Text style={styles.rowActor}>{chat.partnerName}</Text>
                    {chat.unread > 0 ? (
                      <Text style={styles.unread}>
                        {" "}
                        {chat.unread} 条未读
                      </Text>
                    ) : null}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowSummary}>
                    {chat.lastBody}
                  </Text>
                  <Text style={styles.rowTime}>{formatTime(chat.lastAt)}</Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        {signedIn &&
        category !== "chats" &&
        notifications !== null &&
        shown.length === 0 ? (
          <Text style={styles.empty}>这一类还没有消息。</Text>
        ) : null}

        {category === "chats" ? null : shown.map((entry) => (
          <Pressable
            accessibilityRole="button"
            key={entry.id}
            onPress={() => {
              onOpen(entry);
            }}
            style={styles.row}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {entry.actorName.slice(0, 1)}
              </Text>
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowHead}>
                <Text style={styles.rowActor}>{entry.actorName}</Text>
                <Text style={styles.rowAction}> {ACTIONS[entry.kind]}</Text>
              </Text>
              <Text numberOfLines={2} style={styles.rowSummary}>
                {entry.summary}
              </Text>
              <Text style={styles.rowTime}>{formatTime(entry.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  body: {
    flex: 1,
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 12,
    overflow: "hidden",
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
  entry: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    /*
     * 分隔线从标签左缘起，不通栏。
     *
     * 参考图里卡内的每一条 1px 线都内缩到文字起点——通栏会把一张卡切成
     * 几块看起来不相干的横条。
     */
    borderBottomWidth: 1,
    marginLeft: 16,
    flexDirection: "row",
    gap: 12,
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  entryCount: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  entryGlyph: {
    fontSize: 16,
  },
  entryIcon: {
    alignItems: "center",
    backgroundColor: tokens.surface.canvas,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  entryLabel: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 16,
  },
  entryLabelOn: {
    color: tokens.brand.primary,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
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
  row: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowAction: {
    color: tokens.text.secondary,
  },
  rowActor: {
    color: tokens.text.primary,
    fontWeight: "600",
  },
  rowHead: {
    fontSize: 14.5,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowSummary: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  unread: {
    color: tokens.brand.primary,
    fontSize: 12.5,
    fontWeight: "600",
  },
  rowTime: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
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
    fontSize: 17,
    fontWeight: "700",
    /* 右边没有按钮，标题居中会被左边那个返回键顶偏，用等宽留白补回来。 */
    marginRight: 36,
    textAlign: "center",
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
