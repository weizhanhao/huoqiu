import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MentionAccount } from "@huoqiu/domain/social/post-body";

import type { SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { PostBody } from "./post-body";

/*
 * 信息流里的一张帖子卡。
 *
 * 参考图（channel-recommend.png / channel-fund.png）里每张卡都有：头像、昵称、
 * 时间、右上角关注按钮、标题、正文摘要，底部一排分享/讨论/赞。
 *
 * 关注流此前把卡片样式内联在自己文件里——那份只服务关注流，没有关注按钮，
 * 也没有底部动作。频道有六个，再各写一遍必然长歪，所以提出来。
 */

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

/*
 * 短帖没有标题。
 *
 * 发短帖时标题是正文前 24 个字截出来的，不是作者另写的。两个都印出来，
 * 同一句话会连着出现两遍，第一遍还断在半个词上。
 */
const hasWrittenTitle = (title: string, body: string): boolean =>
  !body.trim().startsWith(title.trim());

export type PostCardProperties = Readonly<{
  /** 用于把 @昵称 解析成链接；重名时共享包那边会主动不链接。 */
  accounts: readonly MentionAccount[];
  /** null 表示不显示关注按钮（自己的帖子，或未登录）。 */
  following: boolean | null;
  onAddToWatchlist: (symbol: string, label: string) => void;
  onOpen: () => void;
  onOpenInstrument: (symbol: string) => void;
  onShowActionNotice: (title: string, detail: string) => void;
  onToggleFollow: () => void;
  post: SocialPost;
  topics: readonly string[];
}>;

export function PostCard({
  accounts,
  following,
  onAddToWatchlist,
  onOpen,
  onOpenInstrument,
  onShowActionNotice,
  onToggleFollow,
  post,
  topics,
}: PostCardProperties) {
  return (
    <View style={styles.card} testID="post-card">
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorName.slice(0, 1)}</Text>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.author}>
            {post.authorName}
          </Text>
          <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
        </View>
        {following === null ? null : (
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

      {hasWrittenTitle(post.title, post.body) ? (
        <Pressable accessibilityRole="button" onPress={onOpen}>
          <Text style={styles.title}>{post.title}</Text>
        </Pressable>
      ) : null}

      {/*
        正文不整块包成一个按钮：里面的股票引用和「加自选」自己要能点，
        套在外层按钮里会被它抢走点击。想进详情可以点标题或下面的「讨论」。
      */}
      <PostBody
        accounts={accounts}
        body={post.body}
        onAddToWatchlist={onAddToWatchlist}
        onOpenInstrument={onOpenInstrument}
        topics={topics}
      />

      {/*
        底部这排是参考图里每张卡都有的。分享和讨论还没做，点了如实说明；
        赞数是真的（服务端按 likes 表现算）。
      */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onShowActionNotice("分享", "把这条分享到站外。这一块还没做。");
          }}
          style={styles.actionHit}
        >
          <Text style={styles.action}>⤴ 分享</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={styles.actionHit}
        >
          <Text style={styles.action}>💬 讨论</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onShowActionNotice(
              "点赞",
              "在列表里直接点赞还没做，进帖子详情可以赞。",
            );
          }}
          style={styles.actionHit}
        >
          <Text style={styles.action}>👍 {post.likeCount ?? 0}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  actionHit: {
    justifyContent: "center",
    minHeight: 36,
  },
  actions: {
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 28,
  },
  author: {
    color: tokens.text.primary,
    fontSize: 14.5,
    fontWeight: "600",
  },
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
    color: tokens.text.secondary,
    fontSize: 15,
    lineHeight: 24,
  },
  card: {
    backgroundColor: tokens.surface.base,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  follow: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 32,
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
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
  },
  identity: {
    flex: 1,
    gap: 1,
  },
  time: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 25,
    marginBottom: 6,
  },
});
