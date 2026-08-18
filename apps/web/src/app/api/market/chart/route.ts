import { NextResponse } from "next/server";

import {
  isChartPeriod,
  loadChartSeries,
  peekChartSeries,
} from "../../../../server/chart-series.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 图表数据。
 *
 * 分时那条线要自己动起来——一张停在打开页面那一刻的分时图，跟一张截图
 * 没有区别，而它看起来是活的。页面本身是服务端渲染的，所以由图表组件
 * 定时来问这一条。
 *
 * 缓存十几秒到两分钟（见 chart-series.server.ts）：八个周期按钮来回切，
 * 不该每按一次就出站一次。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const parameters = new URL(request.url).searchParams;
  const symbol = (parameters.get("symbol") ?? "").trim().toLowerCase();
  const period = parameters.get("period") ?? "";

  /*
   * 参数先认一遍再发请求。这个接口不鉴权、对外公开，不挡一道的话
   * 任何人都能拿它去压上游。
   */
  if (!/^(?:sh|sz)\d{6}$|^hk\d{1,5}$|^us[a-z][a-z0-9_]{0,9}$/u.test(symbol)) {
    return NextResponse.json({ error: "代码无法识别。" }, { status: 400 });
  }
  if (!isChartPeriod(period)) {
    return NextResponse.json({ error: "周期无法识别。" }, { status: 400 });
  }

  /*
   * 先看缓存，再过闸。
   *
   * 闸挡的是出站请求，而命中缓存的这一次根本不出站。顺序反过来的话，用户在
   * 同一只票的八个周期之间来回切几轮就会被限住——界面上写着「请求过于频繁」，
   * 而这几轮里一次外呼都没发生过。
   */
  const cached = peekChartSeries(symbol, period);
  if (cached !== null) return NextResponse.json(cached);

  // 这一次真要向站外发请求了，先过闸。
  const throttled = throttleUpstream(request, "market-chart");
  if (throttled !== null) return throttled;

  const series = await loadChartSeries(symbol, period);
  /*
   * 取不到就说取不到（502），不要回一份空序列——空序列会让图把自己清空，
   * 看着像这只股票突然停牌了。
   */
  if (series === null) {
    return NextResponse.json({ error: "行情暂时取不到。" }, { status: 502 });
  }

  return NextResponse.json(series);
}
