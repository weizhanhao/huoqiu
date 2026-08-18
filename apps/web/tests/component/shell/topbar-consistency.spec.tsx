import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AuthLayout from "../../../src/app/(auth)/layout";
import StudioLayout from "../../../src/app/studio/layout";
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
 * 顶栏是全站固定的那一块，不该随页面变。这里守三件事：
 *   1. 两个外壳渲染出来的顶栏一字不差（同一个组件，不是两份长得像的代码）；
 *   2. 顶栏里那几个入口，在哪一页都在。
 *   3. 登录注册复用同一组件的认证态，只留品牌，不露出搜索、消息和设置。
 */

const topbarOf = (markup: string): string => {
  const start = markup.indexOf('<header class="d0-topbar');
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

const studioTopbar = (): string =>
  topbarOf(
    renderToStaticMarkup(
      <StudioLayout>
        <p>创作者中心正文</p>
      </StudioLayout>,
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

const authTopbar = (): string =>
  topbarOf(
    renderToStaticMarkup(
      <AuthLayout>
        <p>登录正文</p>
      </AuthLayout>,
    ),
  );

describe("the top bar is the same one on every page", () => {
  it("renders an identical top bar in every shell", () => {
    const home = homeTopbar();

    /* 先确认真的取到了，否则下面的相等断言在两个空串上也会通过。 */
    expect(home.length).toBeGreaterThan(200);
    expect(stockTopbar()).toBe(home);
    /*
     * 创作者中心是第三套外壳，一开始也自己写了一条顶栏（logo + 分隔线 +
     * 「创作者中心」标题 + 搜索框），同样少了消息、发帖、设置。
     */
    expect(studioTopbar()).toBe(home);
  });

  it("keeps every top-bar entry present outside the community shell", () => {
    /*
     * 上一条只要求「两边一样」——两边一起退化成一条空栏也满足。
     * 这一条钉住里面到底该有什么。
     */
    for (const topbar of [stockTopbar(), studioTopbar()]) {
      expect(topbar).toContain("火球");
      expect(topbar).toContain('action="/search"');
      for (const entry of ["消息", "设置"]) {
        expect(topbar).toContain(`>${entry}<`);
      }
      expect(topbar).not.toContain("发帖");
    }
  });

  it("keeps the auth top bar focused while sharing the same shell", () => {
    const auth = authTopbar();

    expect(auth).toContain('class="d0-topbar d0-topbar-auth"');
    expect(auth).toContain("火球");
    expect(auth).not.toContain('action="/search"');
    expect(auth).not.toContain('href="/notifications"');
    expect(auth).not.toContain('href="/settings"');
  });
});
