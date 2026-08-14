import { NextResponse } from "next/server";

import { listPosts } from "../../../../../server/social-store";

/*
 * 社区热榜。
 *
 * 不鉴权：帖子本来就是公开的，未登录也该看得到大家在聊什么。
 *
 * 只回榜单用得上的三个字段。把正文、作者 id 一并下发，等于让右栏那一小块
 * 顺手把整个社区库序列化一遍。
 */
export const dynamic = "force-dynamic";

const ROWS = 10;

export function GET(): NextResponse {
  const posts = listPosts()
    /*
     * 按真实点赞数排。点赞数是从 likes 现算的，不另存计数器——
     * 存两份迟早对不上，而对不上的表现是榜单顺序和帖子上显示的赞数矛盾。
     */
    .toSorted((left, right) => right.likeCount - left.likeCount)
    .slice(0, ROWS)
    .map((post) => ({
      id: post.id,
      likeCount: post.likeCount,
      title: post.title,
    }));

  return NextResponse.json({ posts });
}
