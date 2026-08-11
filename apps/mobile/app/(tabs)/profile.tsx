import { useRouter } from "expo-router";

import { ProfileHub } from "../../src/components/five-tab/profile-hub";
import {
  syntheticProfile,
  type ProfileDestination,
} from "../../src/features/five-tab/synthetic-fixture";

const profileRoutes = {
  messages: "/messages",
  portfolios: "/portfolios",
  settings: "/settings",
  watchlist: "/watchlist",
} as const satisfies Readonly<
  Record<
    ProfileDestination,
    "/messages" | "/portfolios" | "/settings" | "/watchlist"
  >
>;

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <ProfileHub
      onNavigate={(destination) => router.push(profileRoutes[destination])}
      profile={syntheticProfile}
    />
  );
}
