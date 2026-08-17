import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  const router = useRouter();
  const { account, failure, loading, login, logout, posts, register } =
    useAccountSession();

  /*
   * 还没问完之前不要摆注册表单。
   *
   * 令牌存在 Keychain 里，冷启动要先异步读出来再打一次 /api/social/me。这段
   * 时间 account 是 null——照直渲染的话，老用户每次进「我的」都先看到一个
   * 大写的「注册」，几百毫秒后才闪成自己的主页。第一反应是「我被登出了」。
   */
  if (account === null && loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>正在读取账号……</Text>
      </View>
    );
  }

  /*
   * 断网时也不要摆注册表单。
   *
   * 取数失败时 account 同样是 null，而那不代表「没登录」，代表「没问到」。
   * 让人去注册，他会真的去注册，然后注册也失败——而屏幕上从头到尾没出现过
   * 「连不上服务器」这句真话。
   */
  if (account === null && failure !== null) {
    return (
      <View style={styles.center}>
        <Text style={styles.failure}>{failure}</Text>
        <Text style={styles.empty}>连上之后重新进这一页就能看到账号。</Text>
      </View>
    );
  }

  if (account === null) {
    return <SignInForm onLogin={login} onRegister={register} />;
  }

  /*
   * 「我发的」在这一页，不在关注流里——关注流只放别人写的。
   *
   * 先复制再 sort：Hermes 没有 toSorted（真机会整屏红），而直接 sort 会
   * 就地改掉会话状态里的数组。
   */
  const mine = [...posts]
    .filter((post) => post.authorId === account.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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
        {/*
          设置的入口。此前整个 App 没有任何一处能进设置页——那一页做完了
          四组分组、三项存服务端的真设置，却没人能打开它。
        */}
        <Pressable
          accessibilityLabel="设置"
          accessibilityRole="button"
          onPress={() => router.push("/settings")}
          style={styles.gear}
          testID="profile-settings-entry"
        >
          <Text style={styles.gearGlyph}>⚙</Text>
        </Pressable>
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
      {loading && mine.length === 0 ? (
        <Text style={styles.empty}>正在读取……</Text>
      ) : mine.length === 0 ? (
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
          /*
           * 「退出登录」紧挨着「我发的」那一列，滚动时手指容易落在上面。
           * 退出会删掉 Keychain 里的令牌，下次要重新输密码。
           */
          Alert.alert("退出登录？", "下次进来要重新输一次密码。", [
            { style: "cancel", text: "取消" },
            {
              onPress: () => {
                void logout();
              },
              style: "destructive",
              text: "退出",
            },
          ]);
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
  center: {
    alignItems: "center",
    backgroundColor: tokens.surface.canvas,
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
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
  gear: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: appTouchMinimum,
  },
  gearGlyph: {
    color: tokens.text.secondary,
    fontSize: 22,
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
