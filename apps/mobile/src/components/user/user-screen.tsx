import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { UserProfile } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 别人的主页。
 *
 * 这一页参考图里没有（给到的几张都是自己的「我的」页），所以按站内已有的事实
 * 来搭：头像、昵称、身份、简介、三个数字（帖子/关注/粉丝）、关注按钮，下面是
 * 他发过的帖子。
 *
 * 「收藏」和「回复」两个页签故意不做：那两样只有本人看得到（服务端的
 * /api/social/profile 对他人直接回 403）。画上去点开永远是空的，比不画更像
 * 是坏了。
 */

export type UserScreenProperties = Readonly<{
  failure: string | null;
  /** null 表示不显示关注按钮（自己的主页，或未登录）。 */
  following: boolean | null;
  onBack: () => void;
  onOpenChat: () => void;
  onOpenPost: (postId: string) => void;
  onToggleFollow: () => void;
  /** null 表示还没取到。 */
  profile: UserProfile | null;
}>;

const Stat = ({ label, value }: Readonly<{ label: string; value: number }>) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export function UserScreen({
  failure,
  following,
  onBack,
  onOpenChat,
  onOpenPost,
  onToggleFollow,
  profile,
}: UserScreenProperties) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen} testID="user-screen">
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
          {profile?.displayName ?? ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        {profile === null ? (
          <Text style={styles.empty}>
            {failure === null ? "正在读取资料……" : "这个主页打不开。"}
          </Text>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.displayName.slice(0, 1)}
                </Text>
              </View>
              <View style={styles.identity}>
                <Text numberOfLines={1} style={styles.name}>
                  {profile.displayName}
                </Text>
                <Text style={styles.role}>
                  {profile.role} · {profile.joinedLabel}
                </Text>
              </View>
              {/* 私信入口。服务端的私信一直都在，此前没有任何地方能发起。 */}
              {following === null ? null : (
                <Pressable
                  accessibilityLabel="发私信"
                  accessibilityRole="button"
                  onPress={onOpenChat}
                  style={styles.message}
                >
                  <Text style={styles.messageText}>私信</Text>
                </Pressable>
              )}
              {following === null ? null : (
                <Pressable
                  accessibilityRole="button"
                  onPress={onToggleFollow}
                  style={[styles.follow, following ? styles.followOn : null]}
                  testID="user-follow"
                >
                  <Text
                    style={following ? styles.followTextOn : styles.followText}
                  >
                    {following ? "已关注" : "关注"}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.bio}>{profile.bio}</Text>

            <View style={styles.stats}>
              <Stat label="帖子" value={profile.postCount} />
              <Stat label="关注" value={profile.followingCount} />
              <Stat label="粉丝" value={profile.followerCount} />
            </View>

            <Text style={styles.section}>发过的</Text>

            {profile.posts.length === 0 ? (
              <Text style={styles.empty}>还没发过内容。</Text>
            ) : null}

            {profile.posts.map((post) => (
              <Pressable
                accessibilityRole="button"
                key={post.id}
                onPress={() => {
                  onOpenPost(post.id);
                }}
                style={styles.post}
              >
                <Text numberOfLines={1} style={styles.postTitle}>
                  {post.title}
                </Text>
                <Text numberOfLines={2} style={styles.postBody}>
                  {post.body}
                </Text>
                <Text style={styles.postTime}>{post.publishedLabel}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  bio: {
    backgroundColor: tokens.surface.base,
    color: tokens.text.secondary,
    fontSize: 14.5,
    lineHeight: 22,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  body: {
    flex: 1,
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
  follow: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 18,
  },
  followOn: {
    backgroundColor: tokens.surface.canvas,
  },
  followText: {
    color: tokens.brand.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  followTextOn: {
    color: tokens.text.tertiary,
    fontSize: 14,
  },
  header: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  message: {
    alignItems: "center",
    borderColor: tokens.border.default,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
  },
  messageText: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  name: {
    color: tokens.text.primary,
    fontSize: 19,
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
  post: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  postBody: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  postTime: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  postTitle: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  role: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  section: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  statLabel: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  statValue: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  stats: {
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingVertical: 12,
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
    paddingTop: 8,
  },
});
