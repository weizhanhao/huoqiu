import { Stack } from "expo-router";
import Head from "expo-router/head";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadD0Fixture } from "../src/lib/d0-fixture";
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
