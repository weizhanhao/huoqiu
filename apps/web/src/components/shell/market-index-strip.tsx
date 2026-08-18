import { loadFxSnapshot } from "../../features/real-finance/fx-rates.server";
import { RealIndexCards, type FxIndexCard } from "./real-index-cards";

/*
 * 频道栏上方的指数条。
 *
 * 对标雪球首页顶部那排指数卡：进站第一眼看到的是行情，不是导航。
 *
 * 三张指数卡此前是虚构的「火球全球 100 / 全球成长 / 全球价值」，点数与涨跌
 * 都是写死的常量。现在换成沪深三大指数的真实行情，见 RealIndexCards。
 *
 * 这个壳保持同步：整站外壳到处被 renderToStaticMarkup 渲染，
 * 一旦改成 async，那些页面级测试就全都渲染不出来了。
 */
export function MarketIndexStrip() {
  const fx = loadFxSnapshot();
  const preferredCurrencies = ["USD", "HKD", "EUR", "JPY", "GBP", "AUD"];
  const fxCards: readonly FxIndexCard[] = preferredCurrencies.map((code) => {
    const rate = fx?.rates.find((candidate) => candidate.code === code) ?? null;
    const directChange = rate?.changePct ?? null;
    /*
     * 快照保存的是「1 人民币兑多少外币」，卡片展示的是更常见的反向报价。
     * 反向涨跌不是简单取负：r 涨 p%，1/r 的变化是 -p/(100+p)。
     */
    const inverseChange =
      directChange === null
        ? null
        : Number(((-directChange / (100 + directChange)) * 100).toFixed(3));
    return {
      changePercent: inverseChange,
      code,
      label: rate === null ? code : `${rate.label} / 人民币`,
      source: fx === null ? "暂无数据" : `央行参考 · ${fx.date}`,
      value: rate === null ? null : 1 / rate.rate,
    };
  });

  /*
   * 行情轮播属于页面外壳，不属于下面某个频道的正文。
   * 基金 / 自选等宽工作区会把正文从 640px 扩到 920px，但不能连带把
   * 三张行情卡也拉宽。固定在标准主栏宽度里，右栏显隐只影响下方内容。
   */
  return (
    <div className="market-index-dock">
      <RealIndexCards fxCards={fxCards} />
    </div>
  );
}
