import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { fetchUserProfile } from "../../src/api/social-api";
import { UserScreen } from "../../src/components/user/user-screen";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 别人的主页。
 *
 * 此前点达人榜里的人只弹一句「还没做这一页」——而那个榜是按真实粉丝数排的，
 * 排在最上面的人点不开，这个榜也就没什么用了。
 */
export default function UserProfileRoute() {
  const router = useRouter();
  const { account, following, toggleFollow } = useAccountSession();
  const parameters = useLocalSearchParams<{ accountId?: string | string[] }>();

  const raw = Array.isArray(parameters.accountId)
    ? parameters.accountId[0]
    : parameters.accountId;
  const accountId = raw ?? "";

  const profile = useRemote(
    useCallback(() => fetchUserProfile(accountId), [accountId]),
  );

  return (
    <UserScreen
      failure={profile.failure}
      following={
        account === null || account.id === accountId
          ? null
          : following.includes(accountId)
      }
      onBack={createD0BackHandler(router)}
      onOpenPost={(postId) => {
        router.push({ params: { postId }, pathname: "/post/[postId]" });
      }}
      onToggleFollow={() => {
        void toggleFollow(accountId);
      }}
      profile={profile.value}
    />
  );
}
