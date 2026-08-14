import { NextResponse } from "next/server";

import { consumeAttempt } from "../../../../server/rate-limit";
import { currentAccountId, issueSession } from "../../../../server/session";
import { changePassword } from "../../../../server/social-store";

/*
 * 修改登录密码。
 *
 * 设置页截图上只有「新密码 / 确认密码」两栏。照着做会留下一个洞：任何拿到
 * 会话的人（借用的电脑、被偷的令牌）都能直接改掉密码，把真正的机主锁在外面。
 * 所以这里必须带旧密码。
 *
 * 改成功后账号的令牌世代号 +1，此前签发的票据全部失效——包括发起这次请求
 * 的这一张。所以这里回签一张新的还给本人，否则用户改完密码会被自己踢下线。
 *
 * 也要限流。这个接口会拿 current_password 去做一次 scrypt 比对，不限次数
 * 就等于给了攻击者一个不限速的口令猜测预言机——拿到一张会话票之后，
 * 可以在这里把口令慢慢试出来。和登录同一量级：五分钟十次。
 */
const PASSWORD_LIMIT = 10;
const PASSWORD_WINDOW_MS = 5 * 60 * 1000;

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

  // 在做 scrypt 比对之前就先记一次，否则限流挡不住猜口令。
  const decision = consumeAttempt(`password:${accountId}`, {
    limit: PASSWORD_LIMIT,
    now: Date.now(),
    windowMs: PASSWORD_WINDOW_MS,
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

  const body = payload as Record<string, unknown>;
  const currentPassword =
    typeof body.current_password === "string" ? body.current_password : "";
  const newPassword =
    typeof body.new_password === "string" ? body.new_password : "";
  const confirmation =
    typeof body.confirm_password === "string" ? body.confirm_password : "";

  /*
   * 两次输入不一致在这里就挡掉。
   * 只靠界面校验的话，任何直接打接口的调用都能把密码改成用户没预期的值。
   */
  if (newPassword !== confirmation) {
    return NextResponse.json(
      { error: "两次输入的新密码不一致。" },
      { status: 400 },
    );
  }

  const result = changePassword({
    accountId,
    currentPassword,
    newPassword,
    now: new Date().toISOString(),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const token = issueSession(accountId, Date.now() / 1000, result.tokenEpoch);
  if (token === null) {
    return NextResponse.json(
      { error: "密码已修改，但会话未能续签，请重新登录。" },
      { status: 503 },
    );
  }

  return NextResponse.json({ token });
}
