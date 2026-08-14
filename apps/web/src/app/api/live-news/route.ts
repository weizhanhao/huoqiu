import { NextResponse } from "next/server";

import { loadLiveNews } from "../../../server/live-news.server";
import { throttleUpstream } from "../../../server/upstream-throttle";

/*
 * 7×24 快讯。
 *
 * 不鉴权：公开快讯，谁都能去源站看。
 * 不缓存：这一栏看的就是刚刚发生了什么。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "live-news");
  if (throttled !== null) return throttled;

  const rawRows = new URL(request.url).searchParams.get("rows");
  const feed = await loadLiveNews(
    rawRows === null ? undefined : Number(rawRows),
  );

  if (feed === null) {
    // 说清楚是取不到。空列表会被读成「今天没有快讯」。
    return NextResponse.json({ error: "快讯暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json(feed);
}
