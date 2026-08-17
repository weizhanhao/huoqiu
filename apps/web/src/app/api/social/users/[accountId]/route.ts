import { NextResponse } from "next/server";

import { loadProfile } from "../../../../../features/account/profile-lookup.server";

/*
 * 任意用户的公开主页资料。
 *
 * 不鉴权：主页本来就是公开的，网页版 /users/<id> 不登录也打得开。加一道登录
 * 只会让未登录的人点谁都进不去，挡不住任何事。
 *
 * 但公开的只有公开的那一部分。收藏和回复不在这里——一个人收藏过什么，等于他
 * 在关注什么、在看什么，那是私事，仍然只有 /api/social/profile 给本人。
 *
 * 逐字段挑出来送，而不是把 loadProfile 的结果整个回出去：将来往 ProfileView
 * 上加一个私有字段时，整体透传会把它一起公开，而没有任何地方会报错。
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<Readonly<{ accountId: string }>> }>,
): Promise<NextResponse> {
  const { accountId } = await context.params;
  const profile = loadProfile(accountId);
  if (profile === null) {
    return NextResponse.json({ error: "账号不存在。" }, { status: 404 });
  }

  return NextResponse.json(
    {
      profile: {
        bio: profile.bio,
        displayName: profile.displayName,
        followerCount: profile.followerCount,
        followingCount: profile.followingCount,
        id: profile.id,
        isRegisteredAccount: profile.isRegisteredAccount,
        joinedLabel: profile.joinedLabel,
        postCount: profile.postCount,
        posts: profile.posts,
        role: profile.role,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
