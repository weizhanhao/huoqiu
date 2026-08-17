import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ComingSoonProvider } from "../src/components/system/coming-soon";
import { AccountSessionProvider } from "../src/session/account-session";
import { useAccountSession } from "../src/session/account-session";
import { MarketColorProvider } from "../src/styles/market-colors";

/*
 * 涨跌配色要在会话之内取，所以单独一层。
 *
 * 直接写在 RootLayout 里读不到 useAccountSession——那时 Provider 还没挂上。
 */
function WithMarketColors({ children }: Readonly<{ children: ReactNode }>) {
  const { marketColors } = useAccountSession();
  return (
    <MarketColorProvider mode={marketColors}>{children}</MarketColorProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/*
          顶栏是品牌蓝的实心块，系统默认的深色状态栏文字压在上面看不清。
          明确要浅色。
        */}
        <StatusBar style="light" />
        {/*
          账号会话包在最外面：底下每个页签都要知道「现在是谁」，
          而页签之间来回切时这份状态不能重置。
        */}
        {/*
          「暂未开放」提示层包在最外面：基金、私募、我的等页里那些商业化入口
          都要用它，而弹层必须能盖住整屏。
        */}
        <ComingSoonProvider>
          <AccountSessionProvider>
            <WithMarketColors>
              <Head>
                <title>火球</title>
              </Head>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="search" />
                <Stack.Screen name="instrument/[listingId]" />
                <Stack.Screen name="portfolio/[portfolioId]" />
                <Stack.Screen name="messages" />
                <Stack.Screen name="settings" />
              </Stack>
            </WithMarketColors>
          </AccountSessionProvider>
        </ComingSoonProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
