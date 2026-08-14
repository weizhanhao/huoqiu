import { loadFxSnapshot } from "../../features/real-finance/fx-rates.server";
import { RealIndexCards } from "./real-index-cards";

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
  const usd = fx?.rates.find((rate) => rate.code === "USD") ?? null;
  const usdChange = usd?.changePct ?? null;

  return (
    <section aria-label="市场概览" className="index-strip">
      <RealIndexCards />

      <div className="index-card index-card-fx">
        <span className="index-card-name">美元 / 人民币</span>
        <strong>{usd === null ? "—" : (1 / usd.rate).toFixed(4)}</strong>
        {/* 汇率的涨跌方向要按「1 美元换多少人民币」来看，与 rate 相反。 */}
        <span
          className={
            usdChange === null
              ? undefined
              : usdChange >= 0
                ? "market-down"
                : "market-up"
          }
        >
          {usdChange === null
            ? "—"
            : `${-usdChange >= 0 ? "+" : ""}${(-usdChange).toFixed(2)}%`}
        </span>
        <small>{fx === null ? "暂无数据" : `央行参考 · ${fx.date}`}</small>
      </div>
    </section>
  );
}
