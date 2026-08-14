import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { listNotifications } from "../../../../server/social-store";

/*
 * 当前账号的真实通知。
 *
 * 身份只认令牌。通知里含私信摘要和「谁关注了我」，按 id 查询就等于把这些
 * 全公开出去——这条端点从第一天起就不该接受 ?account= 参数。
 *
 * 未登录返回空列表而不是 401：通知区在未登录时本来就该是空的，报错只会让
 * 外壳的徽标逻辑多一条没必要的分支。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);

  return NextResponse.json(
    { notifications: accountId === null ? [] : listNotifications(accountId) },
    { headers: { "cache-control": "no-store" } },
  );
}
