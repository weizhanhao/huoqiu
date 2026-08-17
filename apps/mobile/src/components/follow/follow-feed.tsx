import { tokens } from "@huoqiu/native-ui";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 关注流。
 *
 * 和网页版是同一条规则：只列你关注的人发的帖子，按时间倒序。自己发的在
 * 「我的」里，不在这儿——用户原话是「这个关注只显示关注人发的内容」。
 */

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

/*
 * 短帖没有标题。
 *
 * 发短帖时标题是正文前 24 个字截出来的，不是作者另写的。照着把标题和正文
 * 都印出来，同一句话会连着出现两遍，第一遍还断在半个词上。
 */
const hasWrittenTitle = (title: string, body: string): boolean =>
  !body.trim().startsWith(title.trim());

export type FollowFeedProperties = Readonly<{
  failure: string | null;
  following: readonly string[];
  loading: boolean;
  onRefresh: () => void;
  posts: readonly SocialPost[];
  signedIn: boolean;
}>;

const Notice = ({ text }: Readonly<{ text: string }>) => (
  <View style={styles.notice}>
    <Text style={styles.noticeText}>{text}</Text>
  </View>
);

export function FollowFeed({
  failure,
  following,
  loading,
  onRefresh,
  posts,
  signedIn,
}: FollowFeedProperties) {
  const followed = posts
    .filter((post) => following.includes(post.authorId))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={loading} />
      }
      style={styles.screen}
      testID="follow-feed"
    >
      <Text style={styles.heading}>关注</Text>

      {/*
        取数失败要如实说，而且要和「没有内容」分开。手机不在服务所在的网段时
        永远是这一条——说成「暂无内容」会让人以为产品是空的，然后去找内容，
        而实际该去看网络。
      */}
      {failure === null ? null : <Notice text={failure} />}

      {signedIn ? null : <Notice text="登录后这里会显示你关注的人发的内容。" />}

      {signedIn && followed.length === 0 && failure === null ? (
        <Notice
          text={
            following.length === 0
              ? "还没有关注任何人。在别人的主页点「关注」，他发的内容就会出现在这里。"
              : "你关注的人还没有发过内容。"
          }
        />
      ) : null}

      {followed.map((post) => (
        <View key={post.id} style={styles.card}>
          <View style={styles.author}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {post.authorName.slice(0, 1)}
              </Text>
            </View>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
          </View>
          {hasWrittenTitle(post.title, post.body) ? (
            <Text style={styles.title}>{post.title}</Text>
          ) : null}
          <Text style={styles.body}>{post.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  author: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    /* 头像 44，整行跟着它走，指头点得准。 */
    minHeight: appTouchMinimum,
  },
  authorName: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    color: tokens.text.secondary,
    fontSize: 15,
    lineHeight: 23,
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  heading: {
    color: tokens.text.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
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
    fontSize: 13,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 25,
  },
});
