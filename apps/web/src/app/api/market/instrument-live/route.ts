import { NextResponse } from "next/server";

import { loadInstrumentSnapshot } from "../../../../server/market-quote.server";
import {
  loadOverseasSnapshot,
  toInstrumentQuote,
} from "../../../../server/overseas-quote.server";
import { loadQuoteMetrics } from "../../../../server/quote-metrics.server";
import { loadTickDetails } from "../../../../server/tick-details.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 个股页上会变的那一整套：报价、指标、五档盘口、成交明细。
 *
 * 一次请求取全量，而不是每块各问各的。看实盘的人盯的是这些数字之间的关系
 * ——委比对着盘口、成交量对着换手。各块分别轮询，屏上就会出现盘口来自
 * 14:35、委比来自 14:36 的组合：两个数各自都「对」，凑在一起却是错的。
 *
 * 不缓存：问的就是此刻。
 */
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^(?:sh|sz)\d{6}$|^hk\d{1,5}$|^us[a-z][a-z0-9_]{0,9}$/u;

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发几次请求，先过闸。
  const throttled = throttleUpstream(request, "instrument-live");
  if (throttled !== null) return throttled;

  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "")
    .trim()
    .toLowerCase();
  /*
   * 参数先认一遍再发请求。这个接口不鉴权、对外公开，不挡一道的话
   * 任何人都能拿它去压上游。
   */
  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "代码无法识别。" }, { status: 400 });
  }

  const isOverseas = symbol.startsWith("hk") || symbol.startsWith("us");

  /* 三路互不依赖，并行发出——串起来就是三个来回。 */
  const [overseas, domestic, metrics, tape] = await Promise.all([
    isOverseas ? loadOverseasSnapshot(symbol, 1) : Promise.resolve(null),
    /* 第三个参数跳过缓存：实时视图要的是此刻，不是一分钟前。 */
    isOverseas
      ? Promise.resolve(null)
      : loadInstrumentSnapshot(symbol, 1, true),
    loadQuoteMetrics(symbol),
    loadTickDetails(symbol),
  ]);

  const quote =
    overseas === null ? (domestic?.quote ?? null) : toInstrumentQuote(overseas);

  /*
   * 一样都没取到才算失败。少一块就少一块——前端保持那一块原样，
   * 而不是把整屏清空。
   */
  if (quote === null && metrics === null && tape === null) {
    return NextResponse.json({ error: "行情暂时取不到。" }, { status: 502 });
  }

  return NextResponse.json({ metrics, quote, tape });
}
