import { tokens } from "@huoqiu/native-ui";
import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.brand.primary,
        tabBarInactiveTintColor: tokens.text.tertiary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: tokens.surface.base,
          borderTopColor: tokens.surface.divider,
          minHeight: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarAccessibilityLabel: "火球首页",
          tabBarIcon: ({ color }) => (
            <Text aria-hidden style={{ color, fontSize: 18 }}>
              ◉
            </Text>
          ),
          title: "火球",
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          tabBarAccessibilityLabel: "自选",
          tabBarIcon: ({ color }) => (
            <Text aria-hidden style={{ color, fontSize: 18 }}>
              ◇
            </Text>
          ),
          title: "自选",
        }}
      />
    </Tabs>
  );
}
