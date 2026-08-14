import { NextResponse } from "next/server";

import { loadMarketAnnouncements } from "../../../../server/market-announcements.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 全市场 A 股公告。
 *
 * 不鉴权：巨潮是法定披露平台，公告本来就是公开的。
 * 不缓存：这一栏看的就是刚披露了什么。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-announcements");
  if (throttled !== null) return throttled;

  const rawRows = new URL(request.url).searchParams.get("rows");
  const page = await loadMarketAnnouncements(
    rawRows === null ? undefined : Number(rawRows),
  );

  if (page === null) {
    // 说清楚是取不到。空列表会被读成「今天没有公告」。
    return NextResponse.json({ error: "公告暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json(page);
}
