import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 两种弹层，共用一套外观。
 *
 * 一种是「暂未开放」：参考图里那些商业化入口（极速开户、立即进群、去开户、
 * 立即解锁）都要保留——它们是产品形态的一部分，去掉之后版面就不是那个样子。
 * 但我们不做交易，所以点下去必须如实说明，并附上那句免责。
 *
 * 另一种是「这次操作没成功」：加自选失败、点赞失败、发不出去。这一类此前也
 * 走同一个弹层，于是每条错误提示尾巴上都挂着一句「本站不提供开户、申购与
 * 下单」——用户只是想加个自选，读到第三行完全不知所云。
 *
 * 「不能做成点了没反应的按钮」这条不变：那是最伤信任的一种，用户会以为整个
 * App 坏了，而不是这一个功能没做。
 *
 * 用弹层而不是 Alert：Alert 在 iOS 上是系统样式，和界面割裂，而且只能给一句话，
 * 说不清「这是什么、为什么现在没有」。
 */

type ComingSoonValue = Readonly<{
  /** 这一次操作没成功。message 用服务端给的原话。 */
  fail: (title: string, message: string) => void;
  /** 这一次操作成功了，或者只是一句说明。同样不带那句免责。 */
  inform: (title: string, message: string) => void;
  /** 这个能力还没做。detail 说明它本来是干什么的，让人知道自己错过了什么。 */
  show: (title: string, detail?: string) => void;
}>;

const ComingSoonContext = createContext<ComingSoonValue | null>(null);

type Notice = Readonly<{
  detail: string | null;
  kind: "failure" | "plain" | "unavailable";
  title: string;
}>;

/* 服务端在未登录时回的原话。认出它才能给一个「去登录」。 */
const SIGN_IN_REQUIRED = "请先登录。";

export function ComingSoonProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);

  const show = useCallback((title: string, detail?: string) => {
    setNotice({ detail: detail ?? null, kind: "unavailable", title });
  }, []);

  const fail = useCallback((title: string, message: string) => {
    setNotice({ detail: message, kind: "failure", title });
  }, []);

  const inform = useCallback((title: string, message: string) => {
    setNotice({ detail: message, kind: "plain", title });
  }, []);

  const value = useMemo<ComingSoonValue>(
    () => ({ fail, inform, show }),
    [fail, inform, show],
  );

  const needsSignIn =
    notice?.kind === "failure" && notice.detail === SIGN_IN_REQUIRED;

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
          accessibilityRole="button"
          onPress={() => {
            setNotice(null);
          }}
          style={styles.backdrop}
        >
          {/*
            卡片本身要拦住触摸。

            RN 里非交互的 View 不阻断冒泡：此前点卡片的空白处会一路冒到背景上
            把弹层关掉——用户以为自己点错了，再打开一次，再关掉一次。

            accessible={false}：它只是块挡板，不是按钮。不写的话读屏会念出一个
            没有名字的按钮罩住整张卡片，聚焦上去按下也没有任何反应。
          */}
          <Pressable
            accessible={false}
            onPress={() => {
              /* 只为拦住冒泡，不做任何事。 */
            }}
            style={styles.card}
          >
            <Text style={styles.title}>{notice?.title ?? ""}</Text>
            <Text style={styles.body}>
              {notice?.detail ?? "这个功能还没有做。"}
            </Text>
            {/*
              那句免责只属于「暂未开放」。挂在每一条错误提示后面，等于告诉
              一个加自选失败的人「本站不提供开户」——他会以为两件事有关系。
            */}
            {notice?.kind === "unavailable" ? (
              <Text style={styles.note}>
                本站不提供开户、申购与下单，涉及资质的能力都不会做。
              </Text>
            ) : null}

            {needsSignIn ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setNotice(null);
                  router.push("/profile");
                }}
                style={styles.action}
                testID="notice-sign-in"
              >
                <Text style={styles.actionText}>去登录</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice(null);
              }}
              style={needsSignIn ? styles.secondary : styles.action}
            >
              <Text
                style={needsSignIn ? styles.secondaryText : styles.actionText}
              >
                知道了
              </Text>
            </Pressable>
          </Pressable>
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
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  secondaryText: {
    color: tokens.text.secondary,
    fontSize: 16,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
});
