import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  listConversations,
  listThread,
  markThreadRead,
  sendMessage,
} from "../../../../server/social-store";

/*
 * 私信。
 *
 * 不带 partner 时返回会话列表；带 partner 时返回该会话的完整消息，
 * 并顺手把对方发来的未读标为已读——用户打开会话就是读了，不需要再点一次
 * 「标记已读」。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const partner = url.searchParams.get("partner");

  /*
   * 私信只能读自己的。
   *
   * 这里原本取的是 ?account= 查询参数——那个 id 就印在个人主页地址里，
   * 于是任何人都能拼出一条链接读走别人的全部私信，读完还顺手替对方
   * 标成已读。会话归属改为只认签名令牌。
   */
  const account = currentAccountId(request);
  if (account === null) {
    return NextResponse.json(
      { error: "请先登录。" },
      { headers: { "cache-control": "no-store" }, status: 401 },
    );
  }

  if (partner === null || partner.length === 0) {
    return NextResponse.json(
      { conversations: listConversations(account), messages: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  markThreadRead(account, partner, new Date().toISOString());
  return NextResponse.json(
    {
      conversations: listConversations(account),
      messages: listThread(account, partner),
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

  // 发信人只能是持票人：否则可以顶着任何人的名义给任何人发私信。
  const fromId = currentAccountId(request);
  if (fromId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const toId = typeof body.target === "string" ? body.target : "";
  const text = typeof body.body === "string" ? body.body : "";

  const result = sendMessage({
    body: text,
    fromId,
    now: new Date().toISOString(),
    toId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      conversations: listConversations(fromId),
      messages: listThread(fromId, toId),
    },
    { status: 201 },
  );
}
