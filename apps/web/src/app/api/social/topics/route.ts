import { NextResponse } from "next/server";

import { communityFeedCards } from "../../../../features/community/community-fixtures";

/*
 * 发帖框里「#」能选的话题。
 *
 * 单独一条接口，是为了不把整份社区夹具打进客户端包——发帖框只要一串标签，
 * 不需要那些卡片正文。
 *
 * 不鉴权：话题广场本来就是公开的一页。
 */
export const dynamic = "force-static";

export function GET(): NextResponse {
  const counts = new Map<string, number>();
  for (const card of communityFeedCards) {
    for (const tag of card.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  /* 用得多的排前面；一样多时按名字排，免得每次构建顺序都不一样。 */
  const topics = [...counts.entries()]
    .sort((left, right) =>
      right[1] === left[1]
        ? left[0].localeCompare(right[0], "zh-CN")
        : right[1] - left[1],
    )
    .map(([tag]) => tag);

  return NextResponse.json({ topics });
}
