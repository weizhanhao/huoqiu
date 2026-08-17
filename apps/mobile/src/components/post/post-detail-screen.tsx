import {
  buildCommentTree,
  replyTargetOf,
} from "@huoqiu/domain/social/comment-tree";
import type { MentionAccount } from "@huoqiu/domain/social/post-body";
import { tokens } from "@huoqiu/native-ui";
import { useState } from "react";
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

import type { PostComment, SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { PostBody } from "../feed/post-body";

/*
 * 帖子详情。
 *
 * 参考图（post-detail.png）里这一页是：顶栏（返回/作者/关注）+ 正文 +
 * 风险提示 + 赞与收藏 + 讨论区（顶层评论下挂回复）+ 底部输入条。
 *
 * 参考图顶部还有一排「讨论 171 / 转发 4 / 赞 203」的页签。这里只留讨论一档：
 * 后两档点开要列出「谁转发了」「谁赞了」，而服务端没有这两个名单接口。画上去
 * 点开永远是空的，比不画更让人以为是坏了。
 *
 * 折叠规则跟参考图一致：回复超过两条时先显示两条，其余收在「查看全部 N 条
 * 回复」后面。
 */

const VISIBLE_REPLIES = 2;

const RISK_NOTICE =
  "风险提示：用户发表的所有文章仅代表个人观点，与火球的立场无关。投资决策需建立在独立思考之上。";

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

/* 短帖的标题是正文头 24 字截出来的，两个都印会重复一遍，还断在半个词上。 */
const hasWrittenTitle = (title: string, body: string): boolean =>
  title.trim().length > 0 && !body.trim().startsWith(title.trim());

export type PostDetailScreenProperties = Readonly<{
  accounts: readonly MentionAccount[];
  bookmarked: boolean;
  /** null 表示还没取到；空数组表示取到了，确实没有评论。 */
  comments: readonly PostComment[] | null;
  commentsFailure: string | null;
  draft: string;
  /** null 表示不显示关注按钮（自己的帖子，或未登录）。 */
  following: boolean | null;
  likeCount: number;
  liked: boolean;
  onAddToWatchlist: (symbol: string, label: string) => void;
  onBack: () => void;
  onChangeDraft: (text: string) => void;
  onOpenAuthor: () => void;
  onOpenInstrument: (symbol: string) => void;
  onReplyTo: (comment: PostComment | null) => void;
  onSubmit: () => void;
  onToggleBookmark: () => void;
  onToggleFollow: () => void;
  onToggleLike: () => void;
  /** null 表示帖子还没取到，或这个 id 不存在——由 postLoaded 区分。 */
  post: SocialPost | null;
  postFailure: string | null;
  /** 帖子列表已经取回来了。为 true 而 post 仍是 null，就是这条不存在。 */
  postLoaded: boolean;
  replyTo: PostComment | null;
  sending: boolean;
  topics: readonly string[];
}>;

const Avatar = ({ name }: Readonly<{ name: string }>) => (
  <View style={styles.avatar}>
    <Text style={styles.avatarText}>{name.slice(0, 1)}</Text>
  </View>
);

export function PostDetailScreen({
  accounts,
  bookmarked,
  comments,
  commentsFailure,
  draft,
  following,
  likeCount,
  liked,
  onAddToWatchlist,
  onBack,
  onChangeDraft,
  onOpenAuthor,
  onOpenInstrument,
  onReplyTo,
  onSubmit,
  onToggleBookmark,
  onToggleFollow,
  onToggleLike,
  post,
  postFailure,
  postLoaded,
  replyTo,
  sending,
  topics,
}: PostDetailScreenProperties) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<readonly string[]>([]);

  const list = comments ?? [];
  const byId = new Map(list.map((comment) => [comment.id, comment]));
  const tree = buildCommentTree(list);
  const canSend = !sending && draft.trim().length > 0;

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
      testID="post-detail-screen"
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
        {post === null ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenAuthor}
            style={styles.identityHit}
          >
            <Avatar name={post.authorName} />
            <Text numberOfLines={1} style={styles.topName}>
              {post.authorName}
            </Text>
          </Pressable>
        )}
        {following === null || post === null ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onToggleFollow}
            style={[styles.follow, following ? styles.followOn : null]}
          >
            <Text style={following ? styles.followTextOn : styles.followText}>
              {following ? "已关注" : "关注"}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {postFailure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{postFailure}</Text>
          </View>
        )}

        {/*
          三种情况要分开。
          
          此前只分了「有没有失败」：帖子被删掉、或转回草稿之后，取数是成功的，
          列表里就是没有这条——界面于是永远停在「正在读取这条内容……」，
          转不完。
        */}
        {post === null ? (
          <Text style={styles.empty}>
            {postFailure !== null
              ? "这条内容打不开了。"
              : postLoaded
                ? "这条内容不在了。可能已被作者删除。"
                : "正在读取这条内容……"}
          </Text>
        ) : (
          <View style={styles.article}>
            {hasWrittenTitle(post.title, post.body) ? (
              <Text style={styles.title}>{post.title}</Text>
            ) : null}
            <PostBody
              accounts={accounts}
              body={post.body}
              onAddToWatchlist={onAddToWatchlist}
              onOpenInstrument={onOpenInstrument}
              topics={topics}
            />
            <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
            <Text style={styles.risk}>{RISK_NOTICE}</Text>

            <View style={styles.reactions}>
              <Pressable
                accessibilityRole="button"
                onPress={onToggleLike}
                style={styles.reaction}
              >
                <Text style={styles.reactionGlyph}>👍</Text>
                <Text style={liked ? styles.reactionOn : styles.reactionCount}>
                  {liked ? `已赞 ${String(likeCount)}` : String(likeCount)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onToggleBookmark}
                style={styles.reaction}
              >
                <Text style={styles.reactionGlyph}>{bookmarked ? "★" : "☆"}</Text>
                <Text
                  style={bookmarked ? styles.reactionOn : styles.reactionCount}
                >
                  {bookmarked ? "已收藏" : "收藏"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.commentHead}>
          <Text style={styles.commentHeadText}>讨论</Text>
          <Text style={styles.commentCount}>{list.length}</Text>
        </View>

        {commentsFailure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{commentsFailure}</Text>
          </View>
        )}

        {comments !== null && tree.length === 0 ? (
          <Text style={styles.empty}>还没有人讨论，来说第一句。</Text>
        ) : null}

        {tree.map((node) => {
          const open = expanded.includes(node.comment.id);
          const shown = open
            ? node.replies
            : node.replies.slice(0, VISIBLE_REPLIES);
          const hidden = node.replies.length - shown.length;

          return (
            <View key={node.comment.id} style={styles.comment}>
              <Avatar name={node.comment.authorName} />
              <View style={styles.commentMain}>
                <Text style={styles.commentAuthor}>
                  {node.comment.authorName}
                </Text>
                <Text style={styles.commentBody}>{node.comment.body}</Text>

                {shown.length === 0 ? null : (
                  <View style={styles.replies}>
                    {shown.map((reply) => {
                      const target = replyTargetOf(reply, node.comment, byId);
                      return (
                        <Text key={reply.id} style={styles.reply}>
                          <Text style={styles.replyName}>
                            {reply.authorName}
                          </Text>
                          {target === null ? null : (
                            <Text style={styles.replyName}>
                              {` 回复 @${target.authorName}`}
                            </Text>
                          )}
                          <Text
                            style={styles.replyBody}
                          >{`：${reply.body}`}</Text>
                        </Text>
                      );
                    })}
                    {hidden > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setExpanded((previous) => [
                            ...previous,
                            node.comment.id,
                          ]);
                        }}
                      >
                        <Text style={styles.more}>
                          查看全部 {node.replies.length} 条回复 ▸
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                <View style={styles.commentFoot}>
                  <Text style={styles.commentTime}>
                    {formatTime(node.comment.createdAt)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onReplyTo(node.comment);
                    }}
                    style={styles.replyHit}
                  >
                    <Text style={styles.replyAction}>回复</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.composer}>
        {/*
          回复对象显示在输入框上方，并给一个「取消」。不显示的话，写到一半切走
          再回来就不知道这句要发给谁——发出去才发现挂错了人，撤不回来。
        */}
        {replyTo === null ? null : (
          <View style={styles.replyingTo}>
            <Text numberOfLines={1} style={styles.replyingText}>
              回复 @{replyTo.authorName}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onReplyTo(null);
              }}
              style={styles.replyHit}
            >
              <Text style={styles.replyAction}>取消</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.composerRow}>
          <TextInput
            multiline
            onChangeText={onChangeDraft}
            placeholder={replyTo === null ? "发讨论…" : "写回复…"}
            placeholderTextColor={tokens.text.tertiary}
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canSend}
            onPress={onSubmit}
            style={[styles.send, canSend ? null : styles.sendOff]}
          >
            <Text style={styles.sendText}>{sending ? "发送中" : "发送"}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  article: {
    backgroundColor: tokens.surface.base,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    /* 参考图：详情页评论 36，信息流才是 32。 */
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    flex: 1,
  },
  comment: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentAuthor: {
    color: tokens.text.tertiary,
    fontSize: 13.5,
  },
  commentBody: {
    color: tokens.text.primary,
    fontSize: 15,
    lineHeight: 23,
  },
  commentCount: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  commentFoot: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  commentHead: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentHeadText: {
    color: tokens.text.primary,
    fontSize: 15.5,
    fontWeight: "700",
  },
  commentMain: {
    flex: 1,
    gap: 6,
  },
  commentTime: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  composer: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    gap: 8,
    paddingBottom: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  composerRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  content: {
    paddingBottom: 24,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  follow: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 16,
  },
  followOn: {
    backgroundColor: tokens.surface.canvas,
  },
  followText: {
    color: tokens.brand.primary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  followTextOn: {
    color: tokens.text.tertiary,
    fontSize: 13.5,
  },
  input: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 18,
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  more: {
    color: tokens.text.link,
    fontSize: 13.5,
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
  reaction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
  },
  reactionCount: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  reactionGlyph: {
    color: tokens.text.secondary,
    fontSize: 16,
  },
  reactionOn: {
    color: tokens.brand.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  reactions: {
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    paddingTop: 6,
  },
  replies: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reply: {
    fontSize: 14,
    lineHeight: 21,
  },
  replyAction: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  replyBody: {
    color: tokens.text.primary,
  },
  replyHit: {
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 10,
  },
  replyName: {
    color: tokens.text.link,
  },
  replyingText: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 13,
  },
  replyingTo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  risk: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
    lineHeight: 19,
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
    color: tokens.surface.base,
    fontSize: 14,
    fontWeight: "600",
  },
  time: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 29,
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
  identityHit: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
  },
  topName: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
