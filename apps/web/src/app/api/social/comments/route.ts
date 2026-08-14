import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { createComment, listComments } from "../../../../server/social-store";

/*
 * 评论。
 *
 * 读是公开的：评论本来就展示给所有访客，登录与否都该看到同一份。
 * 写只认令牌——署名必须是发评论的那个人，请求体里的 account 一概不看。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const postId = new URL(request.url).searchParams.get("post") ?? "";
  return NextResponse.json(
    { comments: postId === "" ? [] : listComments(postId) },
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

  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json(
      { error: "登录后才能发表评论。" },
      { status: 401 },
    );
  }

  const body = payload as Record<string, unknown>;
  const postId = typeof body.post === "string" ? body.post : "";
  const text = typeof body.body === "string" ? body.body : "";
  const parentId =
    typeof body.parent === "string" && body.parent.length > 0
      ? body.parent
      : undefined;

  const result = createComment({
    accountId,
    body: text,
    now: new Date().toISOString(),
    postId,
    ...(parentId === undefined ? {} : { parentId }),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    { comment: result.comment, comments: listComments(postId) },
    { status: 201 },
  );
}
