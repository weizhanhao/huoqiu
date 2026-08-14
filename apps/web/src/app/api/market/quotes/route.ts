import { NextResponse } from "next/server";

import { loadListQuotes } from "../../../../server/market-list.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 自选列表的实时行情。
 *
 * 自选保存在浏览器本地，服务端渲染时并不知道用户关注了哪些标的，
 * 所以由前端把代码列表带上来问。
 *
 * 这里刻意不做鉴权：行情是公开数据，谁都能从数据源自己取。加一道登录
 * 只会让未登录用户的自选变成一列空白，而挡不住任何东西。
 *
 * 不缓存：自选看的就是此刻的价。
 */
export const dynamic = "force-dynamic";

/** 一次最多问这么多只，和取数层的上限对齐。 */
const MAX_SYMBOLS = 200;

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-quotes");
  if (throttled !== null) return throttled;

  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0)
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const quotes = await loadListQuotes(symbols);
  if (quotes === null) {
    /*
     * 说清楚是取不到，而不是回一个空列表——空列表会让页面显示成
     * 「你的自选里这些标的都没有行情」，那是另一回事。
     */
    return NextResponse.json({ error: "行情暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json({ quotes });
}
