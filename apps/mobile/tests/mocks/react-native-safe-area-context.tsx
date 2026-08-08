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
