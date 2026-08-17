import type { ComponentProps, PropsWithChildren } from "react";
import { View } from "react-native";

type SafeAreaViewProperties = ComponentProps<typeof View> &
  Readonly<{
    edges?: readonly ("bottom" | "left" | "right" | "top")[];
  }>;

export function SafeAreaProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function SafeAreaView(properties: SafeAreaViewProperties) {
  const { edges, ...viewProperties } = properties;
  void edges;

  return <View {...viewProperties} />;
}

/*
 * 用例里安全区一律当 0。
 *
 * 真机上这个值由系统给（灵动岛机型顶部 59、iPhone SE 20、底部横条 34）。用例
 * 要断的是「有没有把它加进去」，不是「加了多少」——把某个机型的数字写死在这里，
 * 换一台机器用例就红，而界面其实是对的。
 */
export const useSafeAreaInsets = (): Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}> => ({ bottom: 0, left: 0, right: 0, top: 0 });
