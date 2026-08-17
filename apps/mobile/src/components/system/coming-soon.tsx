import { tokens } from "@huoqiu/native-ui";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 「暂未开放」。
 *
 * 参考图里那些商业化入口（极速开户、立即进群、问AI、去开户、立即解锁）都要保留——
 * 它们是产品形态的一部分，去掉之后版面就不是那个样子了。但我们不做交易，
 * 所以它们点下去必须如实说明。
 *
 * 关键是「不能做成点了没反应的按钮」：那是 yaoqiu.md 里明令禁止的，也是最伤
 * 信任的一种——用户会以为整个 App 坏了，而不是这一个功能没做。
 *
 * 用弹层而不是 Alert：Alert 在 iOS 上是系统样式，和界面割裂，而且只能给一句话，
 * 说不清「这是什么、为什么现在没有」。
 */

type ComingSoonValue = Readonly<{
  /** detail 说明这个入口本来是干什么的，让人知道自己错过了什么。 */
  show: (title: string, detail?: string) => void;
}>;

const ComingSoonContext = createContext<ComingSoonValue | null>(null);

type Notice = Readonly<{ detail: string | null; title: string }>;

export function ComingSoonProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const show = useCallback((title: string, detail?: string) => {
    setNotice({ detail: detail ?? null, title });
  }, []);

  const value = useMemo<ComingSoonValue>(() => ({ show }), [show]);

  return (
    <ComingSoonContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => {
          setNotice(null);
        }}
        transparent
        visible={notice !== null}
      >
        {/*
          点背景关闭。只留一个「知道了」按钮的话，误触打开之后要瞄准那个按钮
          才退得出去，在手机上比顺手点一下旁边麻烦得多。
        */}
        <Pressable
          accessibilityLabel="关闭"
          onPress={() => {
            setNotice(null);
          }}
          style={styles.backdrop}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{notice?.title ?? ""}</Text>
            <Text style={styles.body}>
              {notice?.detail ?? "这个功能还没有做。"}
            </Text>
            <Text style={styles.note}>
              本站不提供开户、申购与下单，涉及资质的能力都不会做。
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice(null);
              }}
              style={styles.action}
            >
              <Text style={styles.actionText}>知道了</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ComingSoonContext.Provider>
  );
}

export function useComingSoon(): ComingSoonValue {
  const value = useContext(ComingSoonContext);
  if (value === null) {
    throw new Error("useComingSoon 必须在 ComingSoonProvider 内使用");
  }
  return value;
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 6,
    minHeight: appTouchMinimum,
  },
  actionText: {
    color: tokens.brand.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(16, 22, 31, 0.45)",
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  body: {
    color: tokens.text.secondary,
    fontSize: 15,
    lineHeight: 23,
  },
  card: {
    backgroundColor: tokens.surface.base,
    borderRadius: 16,
    gap: 10,
    maxWidth: 340,
    padding: 22,
    width: "100%",
  },
  note: {
    color: tokens.text.tertiary,
    fontSize: 13,
    lineHeight: 20,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
});
