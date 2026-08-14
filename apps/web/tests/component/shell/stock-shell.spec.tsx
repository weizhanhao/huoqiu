import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StockShell } from "../../../src/components/shell/stock-shell";

/*
 * 个股页的版面。
 *
 * 个股页此前套的是社区那套壳（DesktopShell）：外面裹着用户卡片、指数条、
 * 「首页/关注/热门/7x24」那排页签和右栏热股榜，中间才是这只股票。
 * 那不是「一只股票的页面」，是「社区页里塞了一只股票」。
 *
 * 雪球的个股页是独立版面：顶上一条窄栏，左边是这只股票的分区导航，
 * 中间是行情。整页只讲这一只股票。
 */

describe("the standalone stock page", () => {
  const render = (name: string, symbol: string): string =>
    renderToStaticMarkup(
      <StockShell name={name} symbol={symbol}>
        <p>行情内容</p>
      </StockShell>,
    );

  it("keeps the community chrome out", () => {
    const html = render("贵州茅台", "sh600519");

    expect(html).toContain("行情内容");
    /*
     * 这几样都属于社区首页，不属于一只股票的页面。混进来的话，用户点开
     * 一只股票，看到的多半还是社区——而他要看的那只股票被挤在中间一栏。
     */
    for (const chrome of ["热股榜", "7x24", "涨跌榜", "私募", "写帖子"]) {
      expect(html, chrome).not.toContain(chrome);
    }
  });

  it("offers a way back out", () => {
    // 独立版面没有主导航，回不去的话这一页就是个死胡同。
    expect(render("贵州茅台", "sh600519")).toContain('href="/"');
  });

  it("names the stock as the page heading", () => {
    /*
     * 每一页的 h1 要说清楚这是哪一页。社区壳里全站的 h1 都是「火球」，
     * 靠标题导航的人在几十条路由之间跳，听到的永远是同一个词。
     */
    expect(render("腾讯控股", "hk00700")).toMatch(
      /<h1[^>]*>[\s\S]*腾讯控股[\s\S]*<\/h1>/u,
    );
  });

  it("only shows the F10 rail where that data exists", () => {
    /*
     * 公司简介、十大股东这些只有沪深个股有。给港美股也挂一列，点进去
     * 每一项都是空的——比不挂更糟，因为它先许诺了有东西。
     */
    expect(render("贵州茅台", "sh600519")).toContain("十大股东");
    expect(render("腾讯控股", "hk00700")).not.toContain("十大股东");
  });
});
