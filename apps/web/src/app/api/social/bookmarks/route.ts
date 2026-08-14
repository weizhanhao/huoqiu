import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { setBookmark } from "../../../../server/social-store";

/*
 * 收藏。
 *
 * 收藏人只能是持票人——请求体里不接受 account 字段，否则谁都能往别人的
 * 收藏夹里塞东西。
 */
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
  const postId = typeof body.post === "string" ? body.post : "";
  if (postId.length === 0) {
    return NextResponse.json({ error: "缺少帖子 id。" }, { status: 400 });
  }

  const result = setBookmark({
    accountId,
    bookmarked: body.bookmarked === true,
    now: new Date().toISOString(),
    postId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ bookmarkCount: result.bookmarkCount });
}
