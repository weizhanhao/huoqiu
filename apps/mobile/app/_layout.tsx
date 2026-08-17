import { Stack } from "expo-router";
import Head from "expo-router/head";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadD0Fixture } from "../src/lib/d0-fixture";
import { ComingSoonProvider } from "../src/components/system/coming-soon";
import { AccountSessionProvider } from "../src/session/account-session";
import { D0WatchlistProvider } from "../src/stores/d0-watchlist";

export default function RootLayout() {
  const fixtureResult = loadD0Fixture();
  const knownListingIds =
    fixtureResult.status === "ready"
      ? fixtureResult.data.instruments.map(
          (instrument) => instrument.listing_id,
        )
      : [];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
            <D0WatchlistProvider knownListingIds={knownListingIds}>
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
            </D0WatchlistProvider>
          </AccountSessionProvider>
        </ComingSoonProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
