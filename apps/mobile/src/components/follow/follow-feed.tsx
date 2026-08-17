import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
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
  onOpenPost: (postId: string) => void;
  onOpenUser: (accountId: string) => void;
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
  onOpenPost,
  onOpenUser,
  onRefresh,
  posts,
  signedIn,
}: FollowFeedProperties) {
  /*
   * 先复制再 sort，不能用 toSorted。
   *
   * Hermes（React Native 0.81 自带的引擎）没有 Array.prototype.toSorted，
   * 真机上直接抛「toSorted is not a function」整屏红。而用例跑在 Node 上，
   * 那里有这个方法，所以全绿——测试引擎比设备新，这类问题测不出来。
   *
   * 也不能直接 .sort()：那会就地改掉会话状态里的数组，React 拿不到新引用，
   * 界面不会更新，而且别处再读到的顺序已经被改过了。
   */
  const followed = [...posts]
    .filter((post) => following.includes(post.authorId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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

      {/*
        还在取的时候不要下结论。
        这一屏是启动后的第一屏：关注了二十个人的用户每次冷启动都先看到
        「还没有关注任何人」，慢网下这句话会停留好几秒——而它是假的。
      */}
      {signedIn && loading && followed.length === 0 && failure === null ? (
        <Notice text="正在读取关注的人发的内容……" />
      ) : null}

      {signedIn && !loading && followed.length === 0 && failure === null ? (
        <Notice
          text={
            following.length === 0
              ? "还没有关注任何人。在别人的主页点「关注」，他发的内容就会出现在这里。"
              : "你关注的人还没有发过内容。"
          }
        />
      ) : null}

      {/*
        整张卡可点进详情，作者那一行单独可点进主页。此前两者都不可点：在关注流
        里看到一条帖子想看评论，点不动；想看这个人还写过什么，也点不动——而
        详情页和用户主页都是做好了的。
      */}
      {followed.map((post) => (
        <Pressable
          accessibilityRole="button"
          key={post.id}
          onPress={() => {
            onOpenPost(post.id);
          }}
          style={styles.card}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onOpenUser(post.authorId);
            }}
            style={styles.author}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {post.authorName.slice(0, 1)}
              </Text>
            </View>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
          </Pressable>
          {hasWrittenTitle(post.title, post.body) ? (
            <Text style={styles.title}>{post.title}</Text>
          ) : null}
          <Text style={styles.body}>{post.body}</Text>
        </Pressable>
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
    /* 参考图里信息流的头像是 32，详情页评论才是 36。 */
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 14,
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
    borderRadius: 12,
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
