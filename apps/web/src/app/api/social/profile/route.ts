import { NextResponse } from "next/server";

import { loadProfile } from "../../../../features/account/profile-lookup.server";
import { currentAccountId } from "../../../../server/session";
import { updateProfile } from "../../../../server/social-store";

/*
 * 主页上「回复」和「收藏」两个页签的内容——本人可见。
 *
 * 一个人收藏过什么，等于他在关注什么、在看什么，那是私事。雪球那两个页签
 * 带锁图标，而此前的实现把它们随页面一起渲染给了所有人。
 *
 * 光在组件里隐藏不管用：服务端渲染出去的数据仍然躺在页面源码里。所以这两块
 * 单独走这个接口，页面本身不再产出它们。
 *
 * 身份只认令牌。查询串里的 account 仅用于「确认你要的就是你自己的」，
 * 它从来不是身份的来源——那个 id 就印在 /users/<id> 上，谁都抄得到。
 */
export function GET(request: Request): NextResponse {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("account");
  if (requested !== null && requested !== accountId) {
    // 登录了不等于有权限：换个 id 就想读别人的收藏夹，不行。
    return NextResponse.json({ error: "无权查看。" }, { status: 403 });
  }

  const profile = loadProfile(accountId);
  if (profile === null) {
    return NextResponse.json({ error: "账号不存在。" }, { status: 404 });
  }

  return NextResponse.json({
    bookmarks: profile.bookmarks,
    replies: profile.replies,
  });
}

/*
 * 编辑资料：昵称、居住地、性别、个人简介。
 *
 * 只认令牌——请求体里的 account 一概不看，否则谁都能改别人的昵称和简介。
 *
 * 字段按「传了才改」处理：设置页分三个页签，一次只提交其中一部分，
 * 整条覆盖会把没在这一屏里的字段抹掉。
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
  const text = (key: string): string | undefined => {
    const value = body[key];
    return typeof value === "string" ? value : undefined;
  };

  const bio = text("bio");
  const city = text("city");
  const displayName = text("display_name");
  const gender = text("gender");
  const province = text("province");

  const result = updateProfile({
    accountId,
    ...(bio === undefined ? {} : { bio }),
    ...(city === undefined ? {} : { city }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(gender === undefined ? {} : { gender }),
    ...(province === undefined ? {} : { province }),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ account: result.account });
}
