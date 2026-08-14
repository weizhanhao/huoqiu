import { NextResponse } from "next/server";

import { clearAttempts, consumeAttempt } from "../../../../server/rate-limit";
import { issueSession } from "../../../../server/session";
import { authenticate, getTokenEpoch } from "../../../../server/social-store";

/*
 * 五分钟内最多 10 次。
 *
 * 按邮箱计数，挡的是「对着某个账号一直猜口令」。窗口短，正常用户打错几次
 * 等一会儿就能继续；登录成功会立刻清零，不会被自己的历史拖住。
 */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

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

  const bucket = `login:${email.trim().toLowerCase()}`;
  const decision = consumeAttempt(bucket, {
    limit: LOGIN_LIMIT,
    now: Date.now(),
    windowMs: LOGIN_WINDOW_MS,
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

  const result = authenticate({ email, password });
  if ("error" in result) {
    // 统一 401，不区分「邮箱不存在」与「密码错误」。
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  // 口令对了就清零：正常用户不该被自己之前打错的几次一直拖着。
  clearAttempts(bucket);

  // 口令验过了，这里把「已经证明过身份」变成一张不可伪造的会话票。
  // 带上当前世代号：改过密码的账号，旧票据世代号偏小，会被后续请求拒掉。
  const token = issueSession(
    result.account.id,
    Date.now() / 1000,
    getTokenEpoch(result.account.id),
  );
  if (token === null) {
    return NextResponse.json(
      { error: "会话服务未配置，暂时无法登录。" },
      { status: 503 },
    );
  }
  return NextResponse.json({ account: result.account, token });
}
