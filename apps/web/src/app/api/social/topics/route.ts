import { extractTopics } from "@huoqiu/domain/social/post-body";
import { NextResponse } from "next/server";

import { listPosts } from "../../../../server/social-store";

/*
 * 发帖框里「#」能选的话题。
 *
 * 此前这一串是从社区夹具（communityFeedCards）里统计出来的——「复盘方法」
 * 「决策日志」这些标签属于几个虚构作者，站内没有任何一条真帖子用过它们。而
 * 用户会从这个面板里选一个，写进自己真实的帖子：等于把夹具的分类体系注进
 * 真实内容。这是全站最后一处用户看得见的假数据。
 *
 * 现在从真实的已发布帖子里统计。没有人写过话题时它就是空的——那也是实话，
 * 发帖器会如实说「还没有话题」，而用户仍然可以自己打一个 #xxx# 出来。
 *
 * 不能再 force-static：它现在读运行时存储，缓存住就等于又回到一份写死的表。
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const counts = new Map<string, number>();
  for (const post of listPosts()) {
    for (const tag of extractTopics(post.body)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  /* 用得多的排前面；一样多时按名字排，免得每次请求顺序都不一样。 */
  const topics = [...counts.entries()]
    .sort((left, right) =>
      right[1] === left[1]
        ? left[0].localeCompare(right[0], "zh-CN")
        : right[1] - left[1],
    )
    .map(([tag]) => tag);

  return NextResponse.json(
    { topics },
    { headers: { "cache-control": "no-store" } },
  );
}
