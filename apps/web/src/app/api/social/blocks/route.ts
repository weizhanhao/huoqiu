import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { listBlocked, setBlock } from "../../../../server/social-store";

/*
 * 屏蔽名单。
 *
 * 读写都只认令牌：屏蔽名单是「我不想再看到谁」，本身就是私密信息，
 * 按 id 查询等于把它公开。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  return NextResponse.json(
    { blocked: accountId === null ? [] : listBlocked(accountId) },
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

  const ownerId = currentAccountId(request);
  if (ownerId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const blockedId = typeof body.target === "string" ? body.target : "";
  if (blockedId.length === 0) {
    return NextResponse.json({ error: "缺少目标账号。" }, { status: 400 });
  }

  const result = setBlock({
    blocked: body.blocked === true,
    blockedId,
    now: new Date().toISOString(),
    ownerId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ blocked: listBlocked(ownerId) });
}
