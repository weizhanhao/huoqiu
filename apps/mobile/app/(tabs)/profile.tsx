import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SignInForm } from "../../src/components/account/sign-in-form";
import { useAccountSession } from "../../src/session/account-session";
import { appTouchMinimum } from "../../src/styles/app-touch";

/*
 * 我的。
 *
 * 这里原先渲染的是 syntheticProfile——一个写死的「演示用户」，不管谁在用，
 * 看到的都是同一个人。现在没登录就给登录表单，登录了就显示这个账号自己的
 * 数字，和网页版同源。
 */
export default function ProfileScreen() {
  const { account, failure, login, logout, posts, register } =
    useAccountSession();

  if (account === null) {
    return <SignInForm onLogin={login} onRegister={register} />;
  }

  /* 「我发的」在这一页，不在关注流里——关注流只放别人写的。 */
  const mine = posts
    .filter((post) => post.authorId === account.id)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="profile-screen"
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {account.displayName.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{account.displayName}</Text>
          <Text style={styles.email}>{account.email}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.followingCount}</Text>
          <Text style={styles.statLabel}>关注</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.followerCount}</Text>
          <Text style={styles.statLabel}>粉丝</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.postCount}</Text>
          <Text style={styles.statLabel}>帖子</Text>
        </View>
      </View>

      {failure === null ? null : <Text style={styles.failure}>{failure}</Text>}

      <Text style={styles.sectionHeading}>我发的</Text>
      {mine.length === 0 ? (
        <Text style={styles.empty}>还没有发过内容。</Text>
      ) : (
        mine.map((post) => (
          <View key={post.id} style={styles.card}>
            <Text style={styles.cardBody}>{post.body}</Text>
          </View>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void logout();
        }}
        style={styles.logout}
      >
        <Text style={styles.logoutText}>退出登录</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarText: {
    color: tokens.brand.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardBody: {
    color: tokens.text.secondary,
    fontSize: 15,
    lineHeight: 23,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 40,
  },
  email: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  failure: {
    color: tokens.market.downText,
    fontSize: 14,
    lineHeight: 21,
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  logout: {
    alignItems: "center",
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: appTouchMinimum,
  },
  logoutText: {
    color: tokens.text.secondary,
    fontSize: 15,
  },
  name: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  sectionHeading: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 6,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  statLabel: {
    color: tokens.text.secondary,
    fontSize: 13,
  },
  statValue: {
    color: tokens.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  stats: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    paddingVertical: 14,
  },
});
