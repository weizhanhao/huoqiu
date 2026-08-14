import { NextResponse } from "next/server";

import { isEtfSort, loadEtfList } from "../../../../server/etf-list.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * ETF 列表。
 *
 * 不鉴权：行情是公开数据，谁都能从数据源自己取，加一道登录只会让未登录
 * 用户看到一片空白，挡不住任何东西。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-etfs");
  if (throttled !== null) return throttled;

  const query = new URL(request.url).searchParams;
  const sort = query.get("sort") ?? "amount";

  /*
   * 排序不认就回 400，不悄悄换成别的口径——那样界面上写着「按涨幅」，
   * 排出来的却是按成交额，而每一行看起来都正常。
   */
  if (!isEtfSort(sort)) {
    return NextResponse.json({ error: "排序依据不正确。" }, { status: 400 });
  }

  const page = Number(query.get("page") ?? "1");

  const list = await loadEtfList({ page, sort });
  if (list === null) {
    // 说清楚是取不到，而不是回空列表——空列表读起来像「今天没有 ETF」。
    return NextResponse.json(
      { error: "ETF 列表暂时取不到。" },
      { status: 503 },
    );
  }

  return NextResponse.json(list);
}
