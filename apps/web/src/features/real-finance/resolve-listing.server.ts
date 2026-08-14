import { cache } from "react";

import { loadKlineSnapshot, type KlineBar } from "./kline.server";
import {
  loadInstrumentSnapshot,
  type InstrumentQuote,
} from "../../server/market-quote.server";
import {
  loadOverseasSnapshot,
  toInstrumentQuote,
} from "../../server/overseas-quote.server";

/*
 * 把一个站内代码解析成一只标的。
 *
 * 此前这段逻辑在页面里写了三遍：预生成快照里的、港美股的、按代码现取的，
 * 三段近乎重复的分支各自组装 props。重复的代价从来不是多打几行字——
 * 港美股那一段漏传了右栏，于是它掉进另一套列定义，左侧导航在切换分区时
 * 水平跳一下。三份不一致，迟早漂移，而漂移出来的样子没人看得出是 bug。
 *
 * 用 React.cache 包住：布局、页面和 generateMetadata 都要这一份，
 * 同一次渲染里只打一次上游。此前是靠注释里那句「这一步会预热缓存」维系的，
 * 缓存策略一改就静默多打一倍请求。
 */

export type ResolvedListing = Readonly<{
  bars: readonly KlineBar[];
  fetchedAt: string;
  /** 「沪市」「深市」「港股」「美股」，给图表卡片当副标题。 */
  market: string;
  name: string;
  /** 取不到就不渲染报价头，而不是拿收盘价冒充现价。 */
  quote: InstrumentQuote | null;
  symbol: string;
}>;

export const resolveListing = cache(
  async (rawSymbol: string): Promise<ResolvedListing | null> => {
    const listingId = rawSymbol.trim().toLowerCase();

    /*
     * 预生成快照里的那几个走快照，省一次日线请求；报价另取。
     */
    const snapshot = loadKlineSnapshot();
    const series =
      snapshot?.series.find((entry) => entry.symbol === listingId) ?? null;
    if (snapshot !== null && series !== null) {
      const live = await loadInstrumentSnapshot(listingId);
      return {
        bars: series.bars,
        fetchedAt: snapshot.fetchedAt,
        market: series.market,
        name: series.name,
        quote: live?.quote ?? null,
        symbol: series.symbol,
      };
    }

    /*
     * 港股与美股。F10、龙虎榜那些分区不会出现在这两个市场上——
     * 它们本来就是沪深独有的，由 isCompanyListing 判定。
     */
    const overseas = await loadOverseasSnapshot(listingId);
    if (overseas !== null) {
      return {
        bars: overseas.bars,
        fetchedAt: overseas.fetchedAt,
        market: overseas.market === "hk" ? "港股" : "美股",
        name: overseas.name,
        quote: toInstrumentQuote(overseas),
        symbol: overseas.symbol,
      };
    }

    /*
     * 快照里没有就按代码现取：那份快照只有 8 个标的，其余沪深股票
     * 全靠这条路。
     */
    const onDemand = await loadInstrumentSnapshot(listingId);
    if (onDemand === null) return null;
    return {
      bars: onDemand.bars,
      fetchedAt: onDemand.fetchedAt,
      market: onDemand.symbol.startsWith("sh") ? "沪市" : "深市",
      name: onDemand.name,
      quote: onDemand.quote,
      symbol: onDemand.symbol,
    };
  },
);
