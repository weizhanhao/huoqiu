import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { setLike } from "../../../../server/social-store";

/*
 * 点赞。
 *
 * 点赞人只能是持票人——请求体里不接受 account 字段。否则「谁赞了我」这条
 * 通知随便谁都能伪造，被赞的人还会以为真有人读过。
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

  const result = setLike({
    accountId,
    liked: body.liked === true,
    now: new Date().toISOString(),
    postId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ likeCount: result.likeCount });
}
