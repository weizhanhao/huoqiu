import { NextResponse } from "next/server";

import {
  FUND_PAGE_SIZE,
  isFundCategory,
  isFundSort,
  loadFundList,
} from "../../../../server/fund-list.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 基金列表。
 *
 * 不鉴权：基金净值和排行是公开数据，加一道登录只会让未登录用户看到一片
 * 空白，挡不住任何东西。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "funds");
  if (throttled !== null) return throttled;

  const query = new URL(request.url).searchParams;
  const category = query.get("category") ?? "";
  const sort = query.get("sort") ?? "oneYear";

  /*
   * 参数不认就回 400，不悄悄换成别的分类——那样界面上写着「债券型」，
   * 列出来的却是混合型，而每一行看起来都很正常。
   */
  if (!isFundCategory(category) || !isFundSort(sort)) {
    return NextResponse.json({ error: "分类或排序不正确。" }, { status: 400 });
  }

  const page = Number(query.get("page") ?? "1");
  const rawSize = query.get("size");
  const size = rawSize === null ? FUND_PAGE_SIZE : Number(rawSize);

  const list = await loadFundList({ category, page, size, sort });
  if (list === null) {
    // 说清楚是取不到，而不是回空列表——空列表读起来像「这个分类没有基金」。
    return NextResponse.json(
      { error: "基金列表暂时取不到。" },
      { status: 503 },
    );
  }

  return NextResponse.json(list);
}
