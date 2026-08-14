import { NextResponse } from "next/server";

import {
  INVEST_TYPES,
  loadPrivateFundManagers,
} from "../../../server/private-fund.server";
import { throttleUpstream } from "../../../server/upstream-throttle";

/*
 * 私募管理人登记信息。
 *
 * 不鉴权：中基协的公示信息本来就是公开的，谁都能去它站上查。
 * 不缓存：登记状态会变（注销、异常经营名单），缓存一份旧的比取不到更糟。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "private-funds");
  if (throttled !== null) return throttled;

  const query = new URL(request.url).searchParams;
  const investType = query.get("type");
  const keyword = query.get("q");
  const rawPage = query.get("page");

  /*
   * 机构类型不认就回 400，不悄悄按「全部」查——那样界面上写着
   * 「私募证券投资基金管理人 · 7224 家」，列出来的是全部 18486 家。
   */
  if (
    investType !== null &&
    investType.length > 0 &&
    !(INVEST_TYPES as readonly string[]).includes(investType)
  ) {
    return NextResponse.json({ error: "机构类型不正确。" }, { status: 400 });
  }

  const page = await loadPrivateFundManagers({
    investType: investType ?? undefined,
    keyword: keyword ?? undefined,
    page: rawPage === null ? undefined : Number(rawPage),
  });

  if (page === null) {
    // 与「没有符合条件的管理人」分开说：那一种是 total 为 0 的正常一页。
    return NextResponse.json(
      { error: "中基协公示信息暂时取不到。" },
      { status: 503 },
    );
  }

  return NextResponse.json(page);
}
