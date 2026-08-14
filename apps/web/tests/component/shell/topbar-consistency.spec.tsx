import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { StockShell } from "../../../src/components/shell/stock-shell";

/*
 * 全站顶栏必须是同一条。
 *
 * 个股页当初为了做成「只讲一只股票」的独立页面，另起了一套外壳，顺手也
 * 另写了一条顶栏——只有 logo 和搜索框，没有消息、发帖、设置，也没有环境
 * 标识，搜索框的宽度和位置还和首页不一样。
 *
 * 后果是：从首页点进一只股票，最上面那条整个跳一下——图标少了几个、
 * 搜索框换了位置。用户的原话是「感觉不是一个页面，有点草台班子」。
 *
 * 顶栏是全站固定的那一块，不该随页面变。这里守两件事：
 *   1. 两个外壳渲染出来的顶栏一字不差（同一个组件，不是两份长得像的代码）；
 *   2. 顶栏里那几个入口，在哪一页都在。
 */

const topbarOf = (markup: string): string => {
  const start = markup.indexOf('<header class="d0-topbar"');
  if (start === -1) return "";
  const end = markup.indexOf("</header>", start);
  return markup.slice(start, end + "</header>".length);
};

const homeTopbar = (): string =>
  topbarOf(
    renderToStaticMarkup(
      <DesktopShell>
        <p>首页正文</p>
      </DesktopShell>,
    ),
  );

const stockTopbar = (): string =>
  topbarOf(
    renderToStaticMarkup(
      <StockShell name="贵州茅台" symbol="sh600519">
        <p>行情正文</p>
      </StockShell>,
    ),
  );

describe("the top bar is the same one on every page", () => {
  it("renders an identical top bar in both shells", () => {
    const home = homeTopbar();
    const stock = stockTopbar();

    /* 先确认真的取到了，否则下面的相等断言在两个空串上也会通过。 */
    expect(home.length).toBeGreaterThan(200);
    expect(stock).toBe(home);
  });

  it("keeps every top-bar entry present on an instrument page", () => {
    /*
     * 上一条只要求「两边一样」——两边一起退化成一条空栏也满足。
     * 这一条钉住里面到底该有什么。
     */
    const stock = stockTopbar();

    expect(stock).toContain("火球");
    expect(stock).toContain('action="/search"');
    for (const entry of ["消息", "发帖", "设置"]) {
      expect(stock).toContain(`>${entry}<`);
    }
  });
});
