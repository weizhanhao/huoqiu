import { NextResponse } from "next/server";

import { searchInstruments } from "../../../../server/search.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 标的搜索。
 *
 * 不鉴权：这是公开的证券代码表，加一道登录只会让未登录用户搜不到东西，
 * 挡不住任何事。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-search");
  if (throttled !== null) return throttled;

  const query = new URL(request.url).searchParams.get("q") ?? "";

  const hits = await searchInstruments(query);
  if (hits === null) {
    /*
     * 说清楚是搜索用不了，而不是回一个空列表——空列表会被读成
     * 「没有这只股票」，那是完全不同的一件事。
     */
    return NextResponse.json({ error: "搜索暂时用不了。" }, { status: 503 });
  }

  return NextResponse.json({ hits });
}
