import { NextResponse } from "next/server";

import {
  MAX_CHANGE_ROWS,
  loadMarketChanges,
} from "../../../../server/market-changes.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 盘口异动。
 *
 * 与热股榜同样不鉴权、不缓存：异动是公开行情，看的就是刚刚这几分钟
 * 发生了什么，缓存下来就没有意义了。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-changes");
  if (throttled !== null) return throttled;

  const rawRows = new URL(request.url).searchParams.get("rows");
  const changes = await loadMarketChanges(
    rawRows === null ? undefined : Number(rawRows),
  );

  if (changes === null) {
    // 说清楚是取不到。回一个空列表会被读成「今天没有异动」。
    return NextResponse.json({ error: "异动暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json({ ...changes, max: MAX_CHANGE_ROWS });
}
