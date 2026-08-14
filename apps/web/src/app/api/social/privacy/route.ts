import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  getCommentPolicy,
  getMarketColors,
  getMutedCategories,
  setCommentPolicy,
  setMarketColors,
  setMutedCategories,
} from "../../../../server/social-store";

/*
 * 隐私设置。
 *
 * 目前只有一项：谁可以评论我发布的讨论。读写都只认令牌——这是「我的」设置，
 * 按 id 查询等于让任何人看到、甚至改掉别人的隐私偏好。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  return NextResponse.json(
    {
      // 未登录返回默认档，界面据此渲染，不必为「读不到」单开一条分支。
      commentPolicy:
        accountId === null ? "everyone" : getCommentPolicy(accountId),
      marketColors: accountId === null ? "red-up" : getMarketColors(accountId),
      mutedCategories:
        accountId === null ? [] : getMutedCategories(accountId),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const now = new Date().toISOString();

  /*
   * 两项设置共用这条端点，各自独立提交。
   * 只带 marketColors 的请求不该被当成「把评论权限设成空」而报错。
   */
  if (Array.isArray(body.mutedCategories)) {
    const result = setMutedCategories({
      accountId,
      categories: body.mutedCategories.filter(
        (value): value is string => typeof value === "string",
      ),
      now,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ mutedCategories: result.mutedCategories });
  }

  if (typeof body.marketColors === "string") {
    const result = setMarketColors({
      accountId,
      mode: body.marketColors,
      now,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ marketColors: result.marketColors });
  }

  const policy =
    typeof body.commentPolicy === "string" ? body.commentPolicy : "";

  const result = setCommentPolicy({ accountId, now, policy });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ commentPolicy: result.commentPolicy });
}
