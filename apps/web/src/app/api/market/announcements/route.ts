import { NextResponse } from "next/server";

import { loadAnnouncements } from "../../../../server/company-ops.server";
import { loadMarketAnnouncements } from "../../../../server/market-announcements.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 公告。带 symbol 时查这一只，不带时是全市场流。
 *
 * 这两支取数一直都在，只是这条路由此前只接了全市场那一支——`symbol` 收下了
 * 却从不看。手机端个股页照着 `?symbol=sh600519` 调它，拿回来的是当天全市场
 * 最新几条，然后原样印在贵州茅台的「公告」页签下面。
 *
 * 这类错查起来最费劲：每一行都是真公告，日期真、链接点得开、PDF 是原件，
 * 只有「这是这只票的公告」这一层是假的，而页面上没有一处会露馅。
 *
 * 不鉴权：巨潮与交易所披露的公告本来就是公开的。
 * 不缓存：这一栏看的就是刚披露了什么。
 */
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^(?:sh|sz)\d{6}$/u;

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-announcements");
  if (throttled !== null) return throttled;

  const parameters = new URL(request.url).searchParams;
  const symbol = (parameters.get("symbol") ?? "").trim().toLowerCase();

  if (symbol.length > 0) {
    /*
     * 认不出来的代码直接退回，一次上游都不发。
     *
     * 这个接口不鉴权、对外公开，不挡一道的话任何人都能拿它去压上游。
     */
    if (!SYMBOL_PATTERN.test(symbol)) {
      return NextResponse.json({ error: "代码无法识别。" }, { status: 400 });
    }

    const forSymbol = await loadAnnouncements(symbol, "latest");
    if (forSymbol === null) {
      return NextResponse.json({ error: "公告暂时取不到。" }, { status: 503 });
    }

    /*
     * 这只票今天没有公告，是一个如实的答案。
     *
     * 缺了就拿全市场最新几条顶上，页面上会出现别人家的公告——而读的人没有
     * 任何办法看出来。宁可空着。
     */
    return NextResponse.json({
      rows: forSymbol.items.map((item) => ({
        category: item.category,
        href: item.href,
        publishedOn: item.noticedOn,
        title: item.title,
      })),
      symbol,
      total: forSymbol.items.length,
    });
  }

  const rawRows = parameters.get("rows");
  const page = await loadMarketAnnouncements(
    rawRows === null ? undefined : Number(rawRows),
  );

  if (page === null) {
    // 说清楚是取不到。空列表会被读成「今天没有公告」。
    return NextResponse.json({ error: "公告暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json(page);
}
