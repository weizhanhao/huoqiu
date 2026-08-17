import { NextResponse } from "next/server";

import { loadResearchReports } from "../../../../server/company-ops.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 一只标的的券商研报。
 *
 * 取数层（company-ops.server.ts 的 loadResearchReports）一直都在，网页版个股页
 * 的研报一栏用的就是它，只是它只在服务端渲染里被调到过，没有对外的接口——
 * 手机端够不着。
 *
 * 手机端个股页此前那一档挂的是「相关 ETF」，而 /api/market/etfs 只认排序和
 * 翻页，根本没有「这只票被哪些 ETF 持有」的概念：每只股票点开，列的都是同一
 * 份按成交额排的全市场 ETF。研报是真按代码查的，换上它，这一档才对得起它
 * 所在的位置。
 *
 * 不鉴权：研报标题、评级、目标价都是券商公开发布的。
 */
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^(?:sh|sz)\d{6}$/u;

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "market-research");
  if (throttled !== null) return throttled;

  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "")
    .trim()
    .toLowerCase();
  /*
   * 认不出来的代码直接退回，一次上游都不发。
   * 这个接口不鉴权、对外公开，不挡一道的话任何人都能拿它去压上游。
   */
  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "代码无法识别。" }, { status: 400 });
  }

  const page = await loadResearchReports(symbol);
  if (page === null) {
    // 说清楚是取不到。空列表会被读成「没有券商写过这只票」。
    return NextResponse.json({ error: "研报暂时取不到。" }, { status: 503 });
  }

  return NextResponse.json({ reports: page.reports, symbol });
}
