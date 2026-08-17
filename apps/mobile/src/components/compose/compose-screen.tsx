import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

import type { SearchHit } from "../../api/market-api";
import type { AccountSummary } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 发帖器。
 *
 * 参考图（compose-longform.png）：顶栏是 ✕ / 发讨论 · 写长文 / 发布，中间是
 * 正文（长文多一行标题），底下一个「公开」标记，再底下一排工具
 * A 图 # @ $ 表情 ⋯。
 *
 * 工具里真正动手的有五个：图（选图压缩后上传）、#（真实话题）、@（真实账号）、
 * $（真实代码表搜索）、表情。
 *
 * A 和 ⋯ 保留位置，但点了只给一句说明：正文在库里是纯文本，没有字体样式可调；
 * 定时发布、存草稿这些也还没有。做成半套「点了像是生效了」的样子比明说更糟——
 * 用户会以为自己排过版了。
 */

export type ComposeMode = "discussion" | "longform";

export type ComposePanel = "cashtag" | "emoji" | "mention" | "topic" | null;

/* 常用表情。系统输入法里也能打，这一排是为了少切一次键盘。 */
const EMOJI = [
  "😀",
  "😅",
  "🤔",
  "😭",
  "😍",
  "👍",
  "👎",
  "🙏",
  "💪",
  "🔥",
  "🚀",
  "📈",
  "📉",
  "💰",
  "🎯",
  "⚠️",
  "❤️",
  "🍺",
] as const;

export type ComposeScreenProperties = Readonly<{
  accounts: readonly AccountSummary[];
  body: string;
  /** 插入之后光标要放在哪；null 表示不干预，交给输入框自己管。 */
  caret: number | null;
  cashtagFailure: string | null;
  cashtagQuery: string;
  /** null 表示还没搜；空数组表示搜过了，确实没有。 */
  cashtagResults: readonly SearchHit[] | null;
  failure: string | null;
  mode: ComposeMode;
  onChangeBody: (text: string) => void;
  onChangeCashtagQuery: (query: string) => void;
  onChangeSelection: (start: number, end: number) => void;
  onChangeTitle: (text: string) => void;
  onClose: () => void;
  onOpenPanel: (panel: ComposePanel) => void;
  onPickAccount: (account: AccountSummary) => void;
  onPickCashtag: (hit: SearchHit) => void;
  onPickEmoji: (emoji: string) => void;
  onPickImage: () => void;
  onPickTopic: (topic: string) => void;
  onSelectMode: (mode: ComposeMode) => void;
  onShowNotice: (title: string, detail: string) => void;
  onSubmit: () => void;
  panel: ComposePanel;
  publishing: boolean;
  title: string;
  topics: readonly string[];
  uploading: boolean;
}>;

export function ComposeScreen({
  accounts,
  body,
  caret,
  cashtagFailure,
  cashtagQuery,
  cashtagResults,
  failure,
  mode,
  onChangeBody,
  onChangeCashtagQuery,
  onChangeSelection,
  onChangeTitle,
  onClose,
  onOpenPanel,
  onPickAccount,
  onPickCashtag,
  onPickEmoji,
  onPickImage,
  onPickTopic,
  onSelectMode,
  onShowNotice,
  onSubmit,
  panel,
  publishing,
  title,
  topics,
  uploading,
}: ComposeScreenProperties) {
  const insets = useSafeAreaInsets();
  /*
   * 长文必须填标题。
   *
   * 不要求的话，长文和短帖存进去一模一样，列表里那一栏标题会拿正文头 24 个字
   * 顶上——而用户以为自己写的是一篇有标题的文章。
   */
  const canPublish =
    !publishing &&
    !uploading &&
    body.trim().length > 0 &&
    (mode === "discussion" || title.trim().length > 0);

  return (
    /*
     * 键盘弹起来时要把底下这块顶上去。
     *
     * iOS 上 RN 默认不做避让：底部那条输入栏会整个被键盘盖住——用户看不见
     * 自己在打什么字。Android 由系统 adjustResize 处理，所以只在 iOS 上加
     * behavior。
     */
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
      testID="compose-screen"
    >
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="关闭"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>✕</Text>
        </Pressable>
        <View style={styles.modes}>
          {(["discussion", "longform"] as const).map((id) => (
            <Pressable
              accessibilityRole="button"
              key={id}
              onPress={() => {
                onSelectMode(id);
              }}
              style={styles.mode}
            >
              <Text style={mode === id ? styles.modeOn : styles.modeText}>
                {id === "discussion" ? "发讨论" : "写长文"}
              </Text>
              {mode === id ? <View style={styles.modeMark} /> : null}
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!canPublish}
          onPress={onSubmit}
          style={[styles.publish, canPublish ? null : styles.publishOff]}
          testID="compose-publish"
        >
          <Text style={styles.publishText}>
            {publishing ? "发布中" : "发布"}
          </Text>
        </Pressable>
      </View>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.body}
      >
        {mode === "longform" ? (
          <TextInput
            onChangeText={onChangeTitle}
            placeholder="请输入标题"
            placeholderTextColor={tokens.text.disabled}
            style={styles.title}
            value={title}
          />
        ) : null}
        <TextInput
          multiline
          onChangeText={onChangeBody}
          onSelectionChange={(event) => {
            const { end, start } = event.nativeEvent.selection;
            onChangeSelection(start, end);
          }}
          placeholder={
            mode === "longform" ? "写作是最好的自我投资" : "说说你的看法"
          }
          placeholderTextColor={tokens.text.disabled}
          style={styles.text}
          value={body}
          {...(caret === null
            ? {}
            : { selection: { end: caret, start: caret } })}
        />
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onShowNotice("公开", "发出来的内容所有人可见。仅自己可见还没做。");
        }}
        style={styles.visibility}
      >
        <Text style={styles.visibilityText}>🌐 公开</Text>
      </Pressable>

      {panel === "cashtag" ? (
        <View style={styles.panel}>
          <TextInput
            autoFocus
            onChangeText={onChangeCashtagQuery}
            placeholder="搜股票 · 基金 · ETF"
            placeholderTextColor={tokens.text.tertiary}
            style={styles.panelInput}
            value={cashtagQuery}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {cashtagFailure === null ? null : (
              <Text style={styles.panelHint}>{cashtagFailure}</Text>
            )}
            {cashtagFailure === null &&
            cashtagResults === null &&
            cashtagQuery.trim().length > 0 ? (
              <Text style={styles.panelHint}>正在搜……</Text>
            ) : null}
            {cashtagResults !== null && cashtagResults.length === 0 ? (
              <Text style={styles.panelHint}>没有匹配的标的。</Text>
            ) : null}
            {(cashtagResults ?? [])
              /* 拼不出站内代码的插进去也点不动，索性不给选。 */
              .filter((hit) => hit.symbol !== null)
              .map((hit) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${hit.kind}-${hit.code}`}
                  onPress={() => {
                    onPickCashtag(hit);
                  }}
                  style={styles.panelRow}
                >
                  <Text style={styles.panelRowText}>{hit.name}</Text>
                  <Text style={styles.panelRowMeta}>{hit.code}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      ) : null}

      {panel === "topic" ? (
        <View style={styles.panel}>
          {topics.length === 0 ? (
            <Text style={styles.panelHint}>还没有话题。</Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {topics.map((topic) => (
              <Pressable
                accessibilityRole="button"
                key={topic}
                onPress={() => {
                  onPickTopic(topic);
                }}
                style={styles.panelRow}
              >
                <Text style={styles.panelRowText}>#{topic}#</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {panel === "mention" ? (
        <View style={styles.panel}>
          {accounts.length === 0 ? (
            <Text style={styles.panelHint}>还没有可以提到的人。</Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {accounts.map((account) => (
              <Pressable
                accessibilityRole="button"
                key={account.id}
                onPress={() => {
                  onPickAccount(account);
                }}
                style={styles.panelRow}
              >
                <Text style={styles.panelRowText}>@{account.displayName}</Text>
                <Text style={styles.panelRowMeta}>
                  {account.followerCount} 关注者
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {panel === "emoji" ? (
        <View style={styles.emojiPanel}>
          {EMOJI.map((emoji) => (
            <Pressable
              accessibilityRole="button"
              key={emoji}
              onPress={() => {
                onPickEmoji(emoji);
              }}
              style={styles.emoji}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.toolbar}>
        <Pressable
          accessibilityLabel="排版"
          accessibilityRole="button"
          onPress={() => {
            onShowNotice("排版", "正文按纯文本存，暂时没有字号和加粗。");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>A</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="插入图片"
          accessibilityRole="button"
          disabled={uploading}
          onPress={onPickImage}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>{uploading ? "…" : "🖼"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="话题"
          accessibilityRole="button"
          onPress={() => {
            onOpenPanel(panel === "topic" ? null : "topic");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>#</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="提到某人"
          accessibilityRole="button"
          onPress={() => {
            onOpenPanel(panel === "mention" ? null : "mention");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>@</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="插入标的"
          accessibilityRole="button"
          onPress={() => {
            onOpenPanel(panel === "cashtag" ? null : "cashtag");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>$</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="表情"
          accessibilityRole="button"
          onPress={() => {
            onOpenPanel(panel === "emoji" ? null : "emoji");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>☺</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="更多"
          accessibilityRole="button"
          onPress={() => {
            onShowNotice("更多", "定时发布、存草稿这些还没做。");
          }}
          style={styles.tool}
        >
          <Text style={styles.toolGlyph}>⋯</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  emoji: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: "11.1%",
  },
  emojiPanel: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 6,
  },
  emojiText: {
    fontSize: 22,
  },
  mode: {
    alignItems: "center",
    gap: 3,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 10,
  },
  modeMark: {
    backgroundColor: tokens.text.primary,
    borderRadius: 1,
    height: 2,
    width: 16,
  },
  modeOn: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  modeText: {
    color: tokens.text.secondary,
    fontSize: 16,
  },
  modes: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
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
  panel: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    maxHeight: 260,
  },
  panelHint: {
    color: tokens.text.tertiary,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  panelInput: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    color: tokens.text.primary,
    fontSize: 15,
    margin: 10,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  panelRow: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  panelRowMeta: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  panelRowText: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
  },
  publish: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 16,
  },
  publishOff: {
    backgroundColor: tokens.brand.subtle,
  },
  publishText: {
    color: tokens.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: tokens.surface.base,
    flex: 1,
  },
  text: {
    color: tokens.text.primary,
    fontSize: 16,
    lineHeight: 26,
    minHeight: 200,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  title: {
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    color: tokens.text.primary,
    fontSize: 22,
    fontWeight: "700",
    minHeight: 52,
    paddingVertical: 10,
  },
  tool: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  toolGlyph: {
    color: tokens.text.secondary,
    fontSize: 19,
  },
  toolbar: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 18,
    paddingTop: 4,
  },
  topAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 36,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 20,
  },
  topbar: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  visibility: {
    alignSelf: "flex-start",
    backgroundColor: tokens.surface.canvas,
    borderRadius: 999,
    justifyContent: "center",
    marginBottom: 6,
    marginLeft: 16,
    minHeight: 30,
    paddingHorizontal: 12,
  },
  visibilityText: {
    color: tokens.text.secondary,
    fontSize: 13,
  },
});
