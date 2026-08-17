import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  createPost,
  listPosts,
  postDisclosures,
  type PostDisclosure,
} from "../../../../server/social-store";

/*
 * 创作声明只认已知的那几种。
 *
 * 原样存下客户端给的字符串，等于让任何人往帖子上挂一句自定的「声明」——
 * 而它在页面上和真声明长得一模一样。
 */
const readDisclosure = (value: unknown): PostDisclosure | undefined =>
  postDisclosures.find((known) => known === value);

/*
 * 公开的帖子列表。
 *
 * 此前拿到全量帖子的唯一途径是 /api/social/me，而那条要登录——于是未登录时
 * 首页各频道只能是空的，而参考图里那些频道不登录也有内容。
 *
 * 不鉴权是安全的：这里只回已发布的帖子，草稿由 listPosts 过滤掉，和登录用户
 * 在 /api/social/me 里看到的 posts 是同一份。真正因人而异的东西（我关注了谁、
 * 赞过什么、收藏了什么）不在这里，仍然只有 /me 才给。
 */
export function GET(): NextResponse {
  return NextResponse.json(
    { posts: listPosts() },
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
  /*
   * 作者只能是持票人。
   *
   * 这里原本读的是请求体里的 account 字段——而那个 id 就印在个人主页地址里，
   * 等于任何人都能以任何人的名义发帖。现在身份只认签名令牌，请求体里再写
   * account 也不会被看一眼。
   */
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body : "";
  const title = typeof body.title === "string" ? body.title : "";
  // 转发时带上原帖 id；普通发布不传，行为与之前完全一致。
  const quotedPostId =
    typeof body.quoted_post_id === "string" && body.quoted_post_id.length > 0
      ? body.quoted_post_id
      : undefined;

  if (text.trim().length === 0) {
    return NextResponse.json(
      { error: "请输入正文后再发布。" },
      { status: 400 },
    );
  }

  const disclosure = readDisclosure(body.disclosure);

  const result = createPost({
    accountId,
    body: text,
    now: new Date().toISOString(),
    title,
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(quotedPostId === undefined ? {} : { quotedPostId }),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json(
    { post: result.post, posts: listPosts() },
    { status: 201 },
  );
}
