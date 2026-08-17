import { tokens } from "@huoqiu/native-ui";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 登录 / 注册。
 *
 * 走网页版同一批接口，所以两边是同一个账号——手机上注册完，网页上登得进去，
 * 反之亦然。
 *
 * 密码规则由服务端说了算（至少 12 位），这里不复制一份：两处各写一份校验，
 * 迟早有一处先改，然后前端放行、后端拒绝，用户看到的是「密码没问题但就是
 * 注册不了」。这里只拦「没填」这种提交前显而易见的情况。
 */

export type SignInFormProperties = Readonly<{
  onLogin: (email: string, password: string) => Promise<string | null>;
  onRegister: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<string | null>;
}>;

type Mode = "login" | "register";

export function SignInForm({ onLogin, onRegister }: SignInFormProperties) {
  /*
   * 默认停在登录。
   *
   * 此前默认是注册：退出登录后再进「我的」，看到的是一个大写的「注册」，
   * 已有账号的人得先找到最底下那行小字才切得回来。而这一屏最常见的来客是
   * 「我有账号，只是被登出了」。
   */
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const isRegister = mode === "register";

  const submit = async () => {
    if (email.trim().length === 0 || password.length === 0) {
      setFailure("邮箱和密码都要填。");
      return;
    }
    if (isRegister && displayName.trim().length === 0) {
      setFailure("昵称要填。");
      return;
    }

    setPending(true);
    setFailure(null);
    try {
      const message = isRegister
        ? await onRegister(displayName.trim(), email.trim(), password)
        : await onLogin(email.trim(), password);
      if (message !== null) setFailure(message);
    } finally {
      /*
       * 解禁必须在 finally 里。写在 await 之后又没有 catch 的话，断网时
       * fetch 直接 reject，这一行永远执行不到，按钮就永久停在禁用态——
       * 而断网恰恰是手机上最常发生的事。
       */
      setPending(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="sign-in-form"
    >
      <Text style={styles.heading}>{isRegister ? "注册" : "登录"}</Text>
      <Text style={styles.subheading}>和网页版是同一个账号，两边通用。</Text>

      {isRegister ? (
        <View style={styles.field}>
          <Text style={styles.label}>昵称</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setDisplayName}
            placeholder="别人看到的名字"
            placeholderTextColor={tokens.text.tertiary}
            style={styles.input}
            value={displayName}
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>邮箱</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          /* 让 iOS 钥匙串认出这是邮箱，才会提示自动填充。 */
          textContentType="emailAddress"
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={tokens.text.tertiary}
          style={styles.input}
          value={email}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>密码</Text>
        <TextInput
          autoCapitalize="none"
          /*
           * 注册时说 newPassword，登录时说 password。
           *
           * 不说的话，钥匙串既不会在注册时提议一个强密码，也不会在登录时提示
           * 填充——而服务端要求 12 位以上，等于逼着人自己编一个再记住。
           */
          autoComplete={isRegister ? "new-password" : "current-password"}
          onChangeText={setPassword}
          placeholder="至少 12 位"
          placeholderTextColor={tokens.text.tertiary}
          secureTextEntry
          style={styles.input}
          textContentType={isRegister ? "newPassword" : "password"}
          value={password}
        />
      </View>

      {failure === null ? null : <Text style={styles.failure}>{failure}</Text>}

      <Pressable
        accessibilityRole="button"
        disabled={pending}
        onPress={() => {
          void submit();
        }}
        style={[styles.submit, pending ? styles.submitPending : null]}
      >
        <Text style={styles.submitText}>
          {pending ? "请稍候…" : isRegister ? "注册" : "登录"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode(isRegister ? "login" : "register");
          setFailure(null);
        }}
        style={styles.switch}
      >
        <Text style={styles.switchText}>
          {isRegister ? "已经有账号了，去登录" : "还没有账号，去注册"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  failure: {
    color: tokens.market.downText,
    fontSize: 14,
    lineHeight: 21,
  },
  field: {
    gap: 6,
  },
  heading: {
    color: tokens.text.primary,
    fontSize: 24,
    fontWeight: "700",
  },
  input: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    color: tokens.text.primary,
    fontSize: 16,
    minHeight: appTouchMinimum,
    paddingHorizontal: 14,
  },
  label: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  subheading: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  submit: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  submitPending: {
    backgroundColor: tokens.brand.primaryPressed,
  },
  submitText: {
    color: tokens.brand.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  switch: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  switchText: {
    color: tokens.text.link,
    fontSize: 15,
  },
});
