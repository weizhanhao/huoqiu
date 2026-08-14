import { NextResponse } from "next/server";

import {
  isHotDirection,
  isHotMarket,
  loadHotBoard,
} from "../../../../server/hot-board.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 热股榜。
 *
 * 不鉴权：行情是公开数据，谁都能从数据源自己取，加一道登录只会让未登录
 * 用户的右栏变成空白，挡不住任何东西。
 *
 * 不缓存：榜单看的就是此刻谁涨得最多。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-hot");
  if (throttled !== null) return throttled;

  const query = new URL(request.url).searchParams;
  const market = query.get("market") ?? "";
  const direction = query.get("direction") ?? "";

  /*
   * 参数不认就直接回 400，不悄悄回落到沪深涨幅榜——
   * 那样界面上写着「港股跌幅榜」，列出来的却是沪深涨幅榜。
   */
  if (!isHotMarket(market) || !isHotDirection(direction)) {
    return NextResponse.json({ error: "市场或方向不正确。" }, { status: 400 });
  }

  /*
   * 条数由调用方给，但上限在取数层夹死（1–50）。
   * 这里不校验也不会出事，但把「不信任外部输入」的位置写在一处更清楚。
   */
  const rawRows = query.get("rows");
  const board = await loadHotBoard(
    market,
    direction,
    rawRows === null ? undefined : Number(rawRows),
  );
  if (board === null) {
    // 说清楚是取不到，而不是回一个空列表——空列表读起来像「今天没有涨跌」。
    return NextResponse.json({ error: "榜单暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json(board);
}
