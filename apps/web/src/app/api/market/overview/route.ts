import { NextResponse } from "next/server";

import { loadMarketOverview } from "../../../../server/market-overview.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 行情中心的概览：主要指数、涨跌家数、行业与概念板块。
 *
 * 不鉴权：行情是公开数据，谁都能从数据源自己取，加一道登录只会让未登录
 * 用户看到一整页空白，挡不住任何东西。
 *
 * 不缓存：行情页看的就是此刻的盘面。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-overview");
  if (throttled !== null) return throttled;

  const overview = await loadMarketOverview();
  if (overview === null) {
    // 说清楚是取不到，而不是回四块空的——空的读起来像「今天没有行情」。
    return NextResponse.json(
      { error: "行情概览暂时取不到。" },
      { status: 503 },
    );
  }

  return NextResponse.json(overview);
}
