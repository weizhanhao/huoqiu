import { tokens } from "@huoqiu/native-ui";
import { Tabs } from "expo-router";
import { Text } from "react-native";

import { appTouchMinimum } from "../../src/styles/app-touch";

/*
 * 底部五栏：火球 / 自选 / 基金 / 私募 / 我的。
 *
 * 这个构成不是随便定的，是参考图（docs/app-reference/）里的原样。此前是
 * 「火球/自选/行情/组合/我的」——把行情和组合摆成了独立页签，而参考图里它们
 * 是「自选」页签内部的顶部分段。归属错了，下面每一页该挂在哪儿就都跟着错。
 *
 * 「基金」「私募」按用户的决定保留：形态照搬，但不涉及交易——申购、开户、下单
 * 一律不做，相关入口点了如实提示「暂未开放」。
 */

type IconProperties = Readonly<{ color: string; glyph: string }>;

const TabIcon = ({ color, glyph }: IconProperties) => (
  <Text aria-hidden style={{ color, fontSize: 18 }}>
    {glyph}
  </Text>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.brand.primary,
        tabBarInactiveTintColor: tokens.text.tertiary,
        tabBarItemStyle: { minHeight: appTouchMinimum },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: tokens.surface.base,
          borderTopColor: tokens.surface.divider,
          minHeight: appTouchMinimum + 16,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarAccessibilityLabel: "火球",
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="◍" />,
          title: "火球",
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          tabBarAccessibilityLabel: "自选",
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="⊞" />,
          title: "自选",
        }}
      />
      <Tabs.Screen
        name="fund"
        options={{
          tabBarAccessibilityLabel: "基金",
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="◈" />,
          title: "基金",
        }}
      />
      <Tabs.Screen
        name="private-fund"
        options={{
          tabBarAccessibilityLabel: "私募",
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="◇" />,
          title: "私募",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: "我的",
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="◉" />,
          title: "我的",
        }}
      />
    </Tabs>
  );
}
