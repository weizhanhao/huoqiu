import { NextResponse } from "next/server";

import { consumeAttempt } from "../../../../server/rate-limit";
import { currentAccountId } from "../../../../server/session";
import { changeEmail } from "../../../../server/social-store";

/*
 * 修改登录邮箱。
 *
 * 身份只认令牌，口令另外验一次：改登录邮箱等于改登录入口，
 * 只凭一个已登录的会话就能改掉它，那么任何一次会话泄露都会直接变成
 * 账号被夺走——受害者连登录都做不到了。
 *
 * 也限流：这个接口能拿来猜口令（每次换个邮箱试一下），
 * 和登录面对的是同一种攻击，所以用同一量级的窗口。
 */
export const dynamic = "force-dynamic";

const EMAIL_LIMIT = 10;
const EMAIL_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const decision = consumeAttempt(`email:${accountId}`, {
    limit: EMAIL_LIMIT,
    now: Date.now(),
    windowMs: EMAIL_WINDOW_MS,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "尝试过于频繁，请稍后再试。" },
      {
        headers: { "retry-after": String(decision.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;
  const currentPassword =
    typeof body.current_password === "string" ? body.current_password : "";
  const newEmail = typeof body.email === "string" ? body.email : "";

  const result = changeEmail({ accountId, currentPassword, newEmail });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ email: result.email });
}
