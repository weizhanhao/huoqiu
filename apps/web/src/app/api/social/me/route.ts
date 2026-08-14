import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  getOwnAccount,
  listAccounts,
  listFollowing,
  listBookmarkedPostIds,
  listLikedPostIds,
  listPosts,
} from "../../../../server/social-store";

/**
 * 读取当前账号与公共社区数据。
 *
 * 「当前账号」以令牌为准，不再取 ?account= 查询参数——那等于谁都能拼一条
 * 链接把自己说成任何人。未登录不报错，只是 account 为 null、following 为空：
 * 公共内容本来就不需要登录才能看。
 *
 * 但「公共内容」不含邮箱。accounts 那一段过去带着全站账号的真实邮箱，
 * 而这个接口不带令牌也回 200——`curl /api/social/me` 就是一份完整的
 * 邮箱名单。现在邮箱只跟着 getOwnAccount 走，那条路要求持有本人的令牌。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  const account = accountId === null ? null : getOwnAccount(accountId);

  return NextResponse.json(
    {
      account,
      accounts: listAccounts(),
      following: account === null ? [] : listFollowing(account.id),
      // 我赞过、收藏过哪些帖子——界面据此把按钮画成已赞/已收藏，
      // 而不是每次刷新都退回未操作状态。
      bookmarkedPostIds:
        account === null ? [] : listBookmarkedPostIds(account.id),
      likedPostIds: account === null ? [] : listLikedPostIds(account.id),
      posts: listPosts(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
