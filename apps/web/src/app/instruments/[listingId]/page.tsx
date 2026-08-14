import type { Metadata } from "next";

import { RealInstrumentDetail } from "../../../features/real-finance/real-instrument-detail";
import { resolveListing } from "../../../features/real-finance/resolve-listing.server";
import {
  type ChartPeriod,
  isChartPeriod,
  loadChartSeries,
} from "../../../server/chart-series.server";
import { loadQuoteMetrics } from "../../../server/quote-metrics.server";
import { loadTickDetails } from "../../../server/tick-details.server";
import { loadKlineSnapshot } from "../../../features/real-finance/kline.server";

/*
 * 行情页。
 *
 * 外壳（顶栏、分区导航、标题行、右栏）在 layout 里，不在这里——放在这里
 * 的话，每切一次分区导航都是一组全新的 DOM 节点，位置就会跳。
 *
 * 这里此前有三段近乎重复的返回块：快照标的、港美股、按代码现取，各自
 * 组装一遍 props。港美股那一段漏传了右栏，于是它掉进另一套列定义，
 * 导航在切换时水平跳一下——重复的代价从来不是多打几行字，是三份迟早
 * 漂移，而漂移出来的样子没人看得出是 bug。现在归一到 resolveListing，
 * 只剩一条渲染路径。
 */

type InstrumentPageProperties = Readonly<{
  params: Promise<Readonly<{ listingId: string }>>;
  /*
   * fixture_state 留着是为了兼容既有链接：它原本用来模拟样本数据的空/错
   * 状态，而样本标的已经没有了——真实行情的失败由取数层如实反映。
   *
   * period 是图表周期。放在地址里而不是客户端状态：一个周期能直接分享
   * 出去，前进后退也管用。
   */
  searchParams?: Promise<
    Readonly<{
      fixture_state?: string | readonly string[];
      period?: string | readonly string[];
    }>
  >;
}>;

/*
 * 只预生成快照里的那几个。
 *
 * 沪深五千多只股票不可能全量预生成，其余按需渲染即可。
 */
export const generateStaticParams = () =>
  (loadKlineSnapshot()?.series ?? []).map((series) => ({
    listingId: series.symbol,
  }));

/*
 * 分享元数据。
 *
 * 走的是同一个 resolveListing（被 React.cache 包着），所以这里不会比
 * 页面本身多打一次上游。此前是三段分支各自取一遍，靠注释里那句
 * 「这一步会预热缓存」维系——缓存策略一改就静默多打一倍请求。
 */
export async function generateMetadata({
  params,
}: Pick<InstrumentPageProperties, "params">): Promise<Metadata> {
  const { listingId } = await params;
  const listing = await resolveListing(listingId);
  if (listing === null) return { title: "标的详情 · 火球" };
  return {
    description: `${listing.name}（${listing.symbol}）的真实日 K 线与区间统计`,
    title: `${listing.name} ${listing.symbol} · 火球`,
  };
}

/** 地址里的周期；认不出来就回到分时——雪球默认看到的也是这张。 */
const periodOf = (
  value: string | readonly string[] | undefined,
): ChartPeriod => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && isChartPeriod(raw) ? raw : "intraday";
};

export default async function InstrumentPage({
  params,
  searchParams,
}: InstrumentPageProperties) {
  const { listingId } = await params;
  const period = periodOf((await searchParams)?.period);

  /*
   * 标的存不存在由同级的 layout 判定，那里 notFound()。
   *
   * 不能放在这里：loading.tsx 会在 layout 的 children 外裹一层 Suspense，
   * notFound() 落到它下面时外壳已经开始流式输出，HTTP 状态码就定成 200 ——
   * 页面写着 404，响应头说一切正常。
   *
   * resolveListing 被 React.cache 包着，这里拿的是 layout 刚问过的那一份。
   */
  const listing = await resolveListing(listingId);
  if (listing === null) return null;

  /* 三路互不依赖，并行发出——串起来白等两个来回。 */
  const [metrics, chartSeries, tape] = await Promise.all([
    loadQuoteMetrics(listing.symbol),
    loadChartSeries(listing.symbol, period),
    loadTickDetails(listing.symbol),
  ]);

  return (
    <RealInstrumentDetail
      chartSeries={chartSeries}
      fetchedAt={listing.fetchedAt}
      metrics={metrics}
      period={period}
      quote={listing.quote}
      series={{
        bars: listing.bars,
        market: listing.market,
        name: listing.name,
        symbol: listing.symbol,
      }}
      tape={tape}
    />
  );
}
