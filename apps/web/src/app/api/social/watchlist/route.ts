import { NextResponse } from "next/server";

import { isWatchableSymbol } from "../../../../lib/watchlist-symbol";
import { currentAccountId } from "../../../../server/session";
import {
  listWatchlistSymbols,
  setWatchlisted,
} from "../../../../server/social-store";

/*
 * 自选。
 *
 * 自选此前只存在浏览器的 localStorage 里——换台设备就没了，手机上加的网页上
 * 看不到。它是最该跟着人走的东西，所以搬到服务端。
 *
 * 归属只认持票人：请求体里不接受 account 字段，否则谁都能改别人的自选。
 */

export function GET(request: Request): NextResponse {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  return NextResponse.json({ symbols: listWatchlistSymbols(accountId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const symbol = typeof body.symbol === "string" ? body.symbol : "";

  /*
   * 站内开不出页面的代码不许加。
   *
   * 加进去只是一行永远取不到价的空记录——用户会以为行情坏了，而其实是这只
   * 标的站内根本渲染不出来。判据和搜索、个股页共用同一份，不另写。
   */
  if (!isWatchableSymbol(symbol)) {
    return NextResponse.json(
      { error: "这个代码站内打不开。" },
      { status: 400 },
    );
  }

  const result = setWatchlisted({
    accountId,
    now: new Date().toISOString(),
    symbol,
    watchlisted: body.watchlisted === true,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ symbols: result.symbols });
}
