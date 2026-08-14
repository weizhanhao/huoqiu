import { NextResponse } from "next/server";

import { loadVideos } from "../../../server/video-list.server";
import { throttleUpstream } from "../../../server/upstream-throttle";

/*
 * 视频列表。
 *
 * 不鉴权：公开的财经视频，谁都能去源站看。
 * 不缓存：这一栏看的就是最近发了什么。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "videos");
  if (throttled !== null) return throttled;

  const rawRows = new URL(request.url).searchParams.get("rows");
  const list = await loadVideos(rawRows === null ? undefined : Number(rawRows));

  if (list === null) {
    // 说清楚是取不到。空列表会被读成「今天没有视频」。
    return NextResponse.json(
      { error: "视频列表暂时取不到。" },
      { status: 503 },
    );
  }

  return NextResponse.json(list);
}
