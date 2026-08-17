import { tokens } from "@huoqiu/native-ui";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { AccountSummary, SocialPost } from "../../api/social-api";
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
  /** 自己的账号 id——推荐位里要把自己剔掉。 */
  meId: string | null;
  onFollow: (accountId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenUser: (accountId: string) => void;
  onRefresh: () => void;
  posts: readonly SocialPost[];
  signedIn: boolean;
  /** 站上所有账号，推荐位从里面挑。 */
  suggestions: readonly AccountSummary[];
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
  meId,
  onFollow,
  onOpenPost,
  onOpenUser,
  onRefresh,
  posts,
  signedIn,
  suggestions,
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

  /*
   * 这一屏空着的时候给几个真人。
   *
   * 空态原来只写一句「在别人的主页点关注」——可这一屏上一个通往别人主页的
   * 入口都没有，那句话等于把用户请出门自己找路。推荐位按真实数据排：先粉丝
   * 数、再发帖数，和「达人」榜同一条规则，没有任何人工加权。
   *
   * 剔掉自己和已经关注的人：推自己没有意义；推已关注的人，那颗按钮点下去是
   * 取消关注，长得却像「关注」。
   */
  const recommended = [...suggestions]
    .filter(
      (candidate) =>
        candidate.id !== meId &&
        !following.includes(candidate.id) &&
        candidate.postCount > 0,
    )
    .sort(
      (left, right) =>
        right.followerCount - left.followerCount ||
        right.postCount - left.postCount,
    )
    .slice(0, 8);

  /* 有内容就不占版面：推荐位会把用户自己选好的关注挤下去。 */
  const showRecommended =
    signedIn && !loading && failure === null && followed.length === 0;

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

      {showRecommended && recommended.length > 0 ? (
        <View style={styles.suggestBlock}>
          <Text style={styles.suggestTitle}>推荐关注</Text>
          <Text style={styles.suggestLede}>
            按粉丝数、发帖数排，不代表任何背书。
          </Text>
          {recommended.map((candidate) => (
            <View key={candidate.id} style={styles.suggestRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onOpenUser(candidate.id);
                }}
                style={styles.suggestMain}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {candidate.displayName.slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.suggestText}>
                  <Text numberOfLines={1} style={styles.suggestName}>
                    {candidate.displayName}
                  </Text>
                  <Text style={styles.suggestMeta}>
                    粉丝 {candidate.followerCount} · 帖子{" "}
                    {candidate.postCount}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`关注 ${candidate.displayName}`}
                accessibilityRole="button"
                onPress={() => {
                  onFollow(candidate.id);
                }}
                style={styles.suggestAction}
              >
                <Text style={styles.suggestActionText}>关注</Text>
              </Pressable>
            </View>
          ))}
        </View>
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
  suggestAction: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
  },
  suggestActionText: {
    color: tokens.text.inverse,
    fontSize: 13,
    fontWeight: "600",
  },
  suggestBlock: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    gap: 4,
    padding: 14,
  },
  suggestLede: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
    marginBottom: 4,
  },
  suggestMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
  },
  suggestMeta: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  suggestName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  suggestRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  suggestText: {
    flex: 1,
    gap: 2,
  },
  suggestTitle: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
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
