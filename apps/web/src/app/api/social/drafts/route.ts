import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  postDisclosures,
  postKinds,
  postVisibilities,
  publishDraft,
  saveDraft,
  type PostDisclosure,
  type PostKind,
  type PostVisibility,
} from "../../../../server/social-store";

/*
 * 草稿的存与发。
 *
 * 身份只认签名令牌。请求体里再写 account 也不会被看一眼——那个 id 就印在
 * 个人主页地址里，认它等于任何人都能以任何人的名义存稿、发稿。
 */

const readKind = (value: unknown): PostKind =>
  typeof value === "string" && (postKinds as readonly string[]).includes(value)
    ? (value as PostKind)
    : "discussion";

/*
 * 创作声明只认已知的那几种。原样存下客户端给的字符串，等于让任何人往
 * 帖子上挂一句自定的「声明」——而它在页面上和真声明长得一模一样。
 */
const readDisclosure = (value: unknown): PostDisclosure | undefined =>
  postDisclosures.find((known) => known === value);

const readVisibility = (value: unknown): PostVisibility | undefined =>
  typeof value === "string" &&
  (postVisibilities as readonly string[]).includes(value)
    ? (value as PostVisibility)
    : undefined;

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
  const now = new Date().toISOString();

  /*
   * publish=true 表示把某一条草稿发出去。
   *
   * 走的是 publishDraft，改状态而不是新建——新建会在草稿箱里留下一份孤儿，
   * 而用户以为自己只发了一次。
   */
  if (body.publish === true) {
    const postId = typeof body.post_id === "string" ? body.post_id : "";
    if (postId.length === 0) {
      return NextResponse.json({ error: "缺少草稿 id。" }, { status: 400 });
    }
    const result = publishDraft({ accountId, now, postId });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ post: result.post });
  }

  const text = typeof body.body === "string" ? body.body : "";
  const title = typeof body.title === "string" ? body.title : "";
  const kind = readKind(body.kind);

  /*
   * 空稿不存。存下来的话草稿箱里会堆一串点进去什么都没有的条目，
   * 而用户以为自己写过东西。
   */
  if (text.trim().length === 0 && title.trim().length === 0) {
    return NextResponse.json({ error: "写点什么再存草稿。" }, { status: 400 });
  }

  const visibility = readVisibility(body.visibility);
  const coverUrl =
    typeof body.cover_url === "string" ? body.cover_url : undefined;
  const postId = typeof body.post_id === "string" ? body.post_id : undefined;

  const disclosure = readDisclosure(body.disclosure);

  const result = saveDraft({
    accountId,
    body: text,
    kind,
    now,
    title,
    ...(coverUrl === undefined ? {} : { coverUrl }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(postId === undefined ? {} : { postId }),
    ...(visibility === undefined ? {} : { visibility }),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ post: result.post });
}
