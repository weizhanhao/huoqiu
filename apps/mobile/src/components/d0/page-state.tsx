import { tokens } from "@huoqiu/native-ui";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

type PageStateProperties = Readonly<{
  state: "normal" | "loading" | "empty" | "error";
  children?: ReactNode;
  emptyMessage?: string;
  errorMessage?: string;
  onRetry?: (() => void) | undefined;
}>;

export function PageState({
  state,
  children,
  emptyMessage = "暂无演示内容",
  errorMessage = "演示数据校验失败",
  onRetry,
}: PageStateProperties) {
  if (state === "normal") {
    return children;
  }

  if (state === "loading") {
    return (
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        style={styles.state}
      >
        <Text style={styles.mark}>···</Text>
        <Text style={styles.title}>正在加载演示数据</Text>
        <Text style={styles.copy}>正在读取固定 Fixture。</Text>
      </View>
    );
  }

  if (state === "empty") {
    return (
      <View accessibilityLiveRegion="polite" style={styles.state}>
        <Text style={styles.mark}>○</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {emptyMessage}
        </Text>
        <Text style={styles.copy}>这里只展示固定 Fixture 中可用的内容。</Text>
      </View>
    );
  }

  return (
    <View accessibilityLiveRegion="assertive" style={styles.state}>
      <Text style={styles.mark}>!</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {errorMessage}
      </Text>
      <Text style={styles.copy}>没有使用未校验数据，也未连接外部服务。</Text>
      <Pressable
        accessibilityLabel="重试加载演示数据"
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>重试</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    justifyContent: "center",
    minHeight: 280,
    padding: 28,
  },
  mark: {
    color: tokens.brand.primary,
    fontSize: 40,
    fontWeight: "700",
  },
  title: {
    color: tokens.text.primary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  copy: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  retry: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 24,
    justifyContent: "center",
    marginTop: 6,
    minHeight: appTouchMinimum,
    minWidth: 112,
    paddingHorizontal: 20,
  },
  retryText: {
    color: tokens.brand.onPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
});
