import { NextResponse } from "next/server";

import { consumeAttempt } from "../../../../server/rate-limit";
import { issueSession } from "../../../../server/session";
import { registerAccount } from "../../../../server/social-store";

/*
 * 一小时内同一邮箱最多 5 次。
 *
 * 注册没有口令可猜，挡的是另一件事：拿同一个邮箱反复试探「这个邮箱注册过
 * 没有」——409 与 201 的区别本身就是一个可枚举的信号。
 */
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/*
 * 注册。字段沿用 packages/contracts 的 authRegisterBodySchema 形状
 * （invite_code / email / password / display_name），
 * 因为 middleware.ts 对 /register 这类认证请求体有专门校验。
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.display_name === "string" ? body.display_name : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return NextResponse.json({ error: "请输入合法邮箱。" }, { status: 400 });
  }
  if (password.length < 12) {
    return NextResponse.json({ error: "密码至少 12 位。" }, { status: 400 });
  }
  if (displayName.trim().length === 0 || displayName.length > 80) {
    return NextResponse.json({ error: "显示名需要 1–80 个字符。" }, { status: 400 });
  }

  // 限流放在写库之前：先挡住，别让被挡下的请求也去动存储。
  const decision = consumeAttempt(`register:${email.trim().toLowerCase()}`, {
    limit: REGISTER_LIMIT,
    now: Date.now(),
    windowMs: REGISTER_WINDOW_MS,
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

  const result = registerAccount({
    displayName,
    email,
    now: new Date().toISOString(),
    password,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  /*
   * 注册成功即发一张会话票。
   *
   * 客户端此后拿它证明身份，而不是把账号 id 当身份用——那个 id 是公开的，
   * 就印在个人主页地址里。
   */
  const token = issueSession(result.account.id, Date.now() / 1000);
  if (token === null) {
    return NextResponse.json(
      { error: "会话服务未配置，暂时无法登录。" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { account: result.account, token },
    { status: 201 },
  );
}
