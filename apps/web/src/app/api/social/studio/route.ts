import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import {
  listAuthorPosts,
  listFollowers,
  readAuthorStats,
  readPostViews,
} from "../../../../server/social-store";

/*
 * 创作者中心要的那一份：自己的全部内容 + 自己的真实数据。
 *
 * 只回持票人自己的。别人的内容和数据都不在这里——这个接口一旦按请求体里的
 * id 取数，任何人都能读到任何人的草稿。
 *
 * 不缓存：草稿刚存完就要能看见。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const posts = listAuthorPosts(accountId);
  const stats = readAuthorStats(accountId);

  return NextResponse.json({
    followerCount: listFollowers(accountId).length,
    posts: posts.map((post) => ({
      body: post.body,
      created_at: post.createdAt,
      id: post.id,
      kind: post.kind,
      status: post.status,
      title: post.title,
      updated_at: post.updatedAt ?? post.createdAt,
      /*
       * 逐篇的阅读量。用作者汇总值填这一列的话，每篇都会显示同一个数——
       * 发得越多每篇看着越热门，而那个数字一眼看不出是假的。
       */
      views: readPostViews(post.id),
    })),
    stats,
  });
}
