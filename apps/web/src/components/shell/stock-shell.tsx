import type { ReactNode } from "react";

import { SiteTopbar } from "./site-topbar";
import { InstrumentNav } from "../../features/real-finance/instrument-nav";
import { isCompanyListing } from "../../features/real-finance/instrument-sections";
import styles from "./stock-shell.module.css";

/*
 * 个股页的版面。
 *
 * 个股页此前套的是社区那套壳（DesktopShell）：外面裹着用户卡片、指数条、
 * 「首页/关注/热门/7x24」那排页签和右栏热股榜，中间才是这只股票。
 * 那不是「一只股票的页面」，是「社区页里塞了一只股票」——用户点开一只票，
 * 满屏还是社区，他要看的东西被挤在中间一栏。
 *
 * 这里另起一套：顶上一条窄栏（回得去、搜得了），左边是这只股票的分区导航，
 * 中间是行情。整页只讲这一只股票。
 */

/** sh600519 → SH:600519；美股还原成大写。 */
const displayCode = (symbol: string): string => {
  const prefix = symbol.slice(0, 2).toUpperCase();
  const code = symbol.slice(2);
  return `${prefix}:${
    prefix === "US" ? code.toUpperCase().replaceAll("_", ".") : code
  }`;
};

export function StockShell({
  actions,
  activeSlug,
  children,
  name,
  rail,
  symbol,
}: Readonly<{
  /** 加自选一类的操作，由页面自己给——壳不该知道自选是怎么存的。 */
  actions?: ReactNode;
  /** 当前停在哪个分区；不给就是行情主页。 */
  activeSlug?: string;
  children: ReactNode;
  /*
   * 右栏：这家公司的简介、同板块个股、持有它的基金。
   * 没有就不给——港美股与指数拿不到 A 股的板块与 F10，留一条空栏
   * 只会把正文挤窄，换来一片空白。
   */
  rail?: ReactNode;
  name: string;
  symbol: string;
}>) {
  /*
   * 公司简介、十大股东、龙虎榜这些只有沪深个股有。给指数和港美股也挂一列，
   * 点进去每一项都是空的——比不挂更糟，因为它先许诺了有东西。
   */
  const hasSections = isCompanyListing(symbol);

  return (
    <div className={styles.shell}>
      <SiteTopbar />

      {/*
        版面模式只由标的类型决定，不由数据取没取到决定。
        此前是「有没有 rail」决定用哪套列定义——而 rail 永远是一个 JSX
        元素（内容为空时组件自己返回 null），那个判空从来没生效过；
        真要生效了反而更糟：F10 抖一下就换一次版面。
      */}
      <div className={hasSections ? styles.layout : styles.layoutWide}>
        {hasSections ? (
          <aside aria-label="个股分区导航" className={styles.nav}>
            <InstrumentNav
              {...(activeSlug === undefined ? {} : { currentSlug: activeSlug })}
              symbol={symbol}
            />
          </aside>
        ) : null}

        <main className={styles.main}>
          {/*
            页面标题是这只股票，不是站名。社区壳里全站每一页的 h1 都是
            「火球」，靠标题导航的人在几十条路由之间跳，听到的永远是同一个词。
          */}
          <div className={styles.identity}>
            <h1 className={styles.name}>
              {name}
              <span className={styles.code}>({displayCode(symbol)})</span>
            </h1>
            {actions === undefined ? null : (
              <div className={styles.actions}>{actions}</div>
            )}
          </div>
          {children}
        </main>

        {rail}
      </div>
    </div>
  );
}
