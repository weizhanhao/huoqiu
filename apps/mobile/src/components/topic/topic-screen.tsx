import { extractTopics, plainPostText } from "@huoqiu/domain/social/post-body";
import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 一个话题下的帖子。
 *
 * 正文里的 #话题# 此前只是染成了链接色，点不动——手机端根本没有这一页。
 * 蓝色是「这里能点」的承诺，兑现不了就不该染色；而话题恰恰是这类社区里最
 * 自然的一条横向路径：看到一句「#基金定投#」，想看看还有谁在聊这个。
 *
 * 不新开接口：话题本来就没有独立的存储，它是从正文里抽出来的记号。哪些帖子
 * 属于这个话题，用共享包里那份 extractTopics 现算——和「话题列表」那条接口
 * 同一个函数，两边不会各算各的。
 */

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export type TopicScreenProperties = Readonly<{
  failure: string | null;
  loading: boolean;
  onBack: () => void;
  onOpenPost: (postId: string) => void;
  onRefresh: () => void;
  /** null 表示还没取到。 */
  posts: readonly SocialPost[] | null;
  tag: string;
}>;

export function TopicScreen({
  failure,
  loading,
  onBack,
  onOpenPost,
  onRefresh,
  posts,
  tag,
}: TopicScreenProperties) {
  const insets = useSafeAreaInsets();

  /*
   * 大小写和首尾空格都当同一个话题。
   *
   * 「#复盘#」和「#复盘 #」是同一件事，分成两页只会让两边各看到一半。
   */
  const wanted = tag.trim().toLowerCase();
  const matched =
    posts === null
      ? null
      : posts
          .filter((post) =>
            extractTopics(post.body).some(
              (found) => found.trim().toLowerCase() === wanted,
            ),
          )
          /* 先复制再排：Hermes 没有 toSorted，而且原数组是会话状态里的那一份。 */
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <View style={styles.screen} testID="topic-screen">
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
          #{tag}#
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={loading} />
        }
        style={styles.body}
      >
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        {matched === null && failure === null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取……</Text>
          </View>
        ) : null}

        {/*
          「还没取到」和「这个话题下没有帖子」是两件事——只有后者配得上这句话。
        */}
        {matched !== null && matched.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              还没有人在这个话题下发过内容。发帖时写上 #{tag}#，就会出现在这里。
            </Text>
          </View>
        ) : null}

        {matched !== null && matched.length > 0 ? (
          <Text style={styles.count}>{matched.length} 条内容</Text>
        ) : null}

        {(matched ?? []).map((post) => (
          <Pressable
            accessibilityRole="button"
            key={post.id}
            onPress={() => {
              onOpenPost(post.id);
            }}
            style={styles.card}
          >
            <View style={styles.head}>
              <Text numberOfLines={1} style={styles.author}>
                {post.authorName}
              </Text>
              <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
            </View>
            <Text numberOfLines={4} style={styles.excerpt}>
              {plainPostText(post.body)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  author: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    paddingBottom: 32,
  },
  count: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  excerpt: {
    color: tokens.text.secondary,
    fontSize: 14.5,
    lineHeight: 22,
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  time: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
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
