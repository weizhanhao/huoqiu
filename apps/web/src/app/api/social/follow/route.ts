import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { listFollowing, setFollow } from "../../../../server/social-store";

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }
  // 关注动作只能代表持票人自己，不能由请求体指定「谁去关注」。
  const followerId = currentAccountId(request);
  if (followerId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const followeeId = typeof body.target === "string" ? body.target : "";
  const following = body.following === true;

  const result = setFollow({
    followeeId,
    followerId,
    following,
    now: new Date().toISOString(),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    followerCount: result.followerCount,
    following: listFollowing(followerId),
  });
}
