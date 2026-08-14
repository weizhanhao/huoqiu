import type { Metadata } from "next";
import { InstrumentLink } from "../../components/instrument/instrument-link";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealMarketOverview } from "../../features/market-portfolio/real-market-overview";
import { KlineChart } from "../../features/real-finance/kline-chart";
import { loadKlineSnapshot } from "../../features/real-finance/kline.server";
import styles from "../../features/real-finance/kline-chart.module.css";

/*
 * 行情首页。
 *
 * 真实日 K 线放在最上面，行情概览在下面。两块都是真数据：概览此前是一整套
 * 样本（恒生样本指数、全球航运、星港制造），现在换成了沪深实时指数、
 * 涨跌家数与板块表现。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "指数与个股的真实日 K 线、沪深涨跌家数与板块表现",
  title: "行情 · 火球",
};

export default function MarketsPage() {
  const snapshot = loadKlineSnapshot();

  return (
    <DesktopShell activePrimary="markets">
      {/*
        概览放在最前面，因为该页的 <h1> 在它里面。
        此前八张 K 线卡的 <h3> 排在 h1 之前——靠标题导航的人要先听完八只
        标的，才被告知自己在哪一页，正好抵消了把品牌从 h1 降级的意义。
      */}
      <RealMarketOverview />
      {snapshot === null ? (
        <section className={styles.chartCard}>
          <p className={styles.empty}>
            真实行情快照尚未生成。运行 <code>node scripts/fetch-kline.mjs</code>{" "}
            后刷新即可看到日 K 线。快照缺失时这里不会用样本数据顶替。
          </p>
        </section>
      ) : (
        snapshot.series.map((series) => (
          /*
            这几张图过去是死的：看得见，点不进去，这只标的没有自己的页面。
            现在每张图都通向 /instruments/<代码>，那里有同一份真实日线、
            由它算出的区间统计，以及带 $代码$ 的真实讨论入口。
          */
          <InstrumentLink
            className={styles.chartLink}
            key={series.symbol}
            symbol={series.symbol}
          >
            <KlineChart
              interactive={false}
              bars={series.bars}
              market={series.market}
              name={series.name}
              sourceLabel={`${snapshot.source} · ${snapshot.sourceNote}`}
              symbol={series.symbol}
            />
          </InstrumentLink>
        ))
      )}

    </DesktopShell>
  );
}
