import { tokens } from "@huoqiu/native-ui";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DirectMessage } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 一条私信会话。
 *
 * 服务端的私信早就完整做好了（会话列表、单会话、发信、打开即已读），移动端此前
 * 一个字都没接——整块能力谁也用不到。
 *
 * 参考图里没有这一页（README 把它列在「需要补充参考图」里），所以按最朴素的
 * 聊天形态搭：自己发的靠右、对方发的靠左，底下一条输入栏。
 */

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export type ChatScreenProperties = Readonly<{
  draft: string;
  failure: string | null;
  /** 我自己的账号 id，用来判断哪一条靠右。 */
  meId: string | null;
  /** null 表示还没取到。 */
  messages: readonly DirectMessage[] | null;
  onBack: () => void;
  onChangeDraft: (text: string) => void;
  onSubmit: () => void;
  partnerName: string;
  sending: boolean;
}>;

export function ChatScreen({
  draft,
  failure,
  meId,
  messages,
  onBack,
  onChangeDraft,
  onSubmit,
  partnerName,
  sending,
}: ChatScreenProperties) {
  const insets = useSafeAreaInsets();
  const canSend = !sending && draft.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
      testID="chat-screen"
    >
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.topTitle}>
          {partnerName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        {messages === null ? <Text style={styles.empty}>正在读取……</Text> : null}

        {messages !== null && messages.length === 0 ? (
          <Text style={styles.empty}>还没有聊过。说第一句吧。</Text>
        ) : null}

        {(messages ?? []).map((message) => {
          const mine = message.fromId === meId;
          return (
            <View
              key={message.id}
              style={[styles.line, mine ? styles.lineMine : null]}
            >
              <View style={[styles.bubble, mine ? styles.bubbleMine : null]}>
                <Text style={mine ? styles.textMine : styles.text}>
                  {message.body}
                </Text>
              </View>
              <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          multiline
          onChangeText={onChangeDraft}
          placeholder="说点什么…"
          placeholderTextColor={tokens.text.tertiary}
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!canSend}
          onPress={onSubmit}
          style={[styles.send, canSend ? null : styles.sendOff]}
          testID="chat-send"
        >
          <Text style={styles.sendText}>{sending ? "发送中" : "发送"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  bubble: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: tokens.brand.primary,
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  content: {
    gap: 10,
    padding: 16,
    paddingBottom: 24,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: "center",
  },
  input: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 18,
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  line: {
    alignItems: "flex-start",
    gap: 3,
  },
  lineMine: {
    alignItems: "flex-end",
  },
  notice: {
    backgroundColor: tokens.market.warningSubtle,
    borderRadius: 8,
    padding: 12,
  },
  noticeText: {
    color: tokens.market.warningText,
    fontSize: 13,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  send: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 16,
  },
  sendOff: {
    backgroundColor: tokens.border.default,
  },
  sendText: {
    color: tokens.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
  text: {
    color: tokens.text.primary,
    fontSize: 15,
    lineHeight: 23,
  },
  textMine: {
    color: tokens.text.inverse,
    fontSize: 15,
    lineHeight: 23,
  },
  time: {
    color: tokens.text.tertiary,
    fontSize: 11.5,
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
    fontSize: 16,
    fontWeight: "600",
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
});
