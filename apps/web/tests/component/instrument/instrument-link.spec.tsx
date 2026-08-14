import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InstrumentLink } from "../../../src/components/instrument/instrument-link";

/*
 * 股票链接。
 *
 * 雪球点一只股票是新开一页，原来那页留在原处——用户翻榜单、点开几只、
 * 挨个比较，榜单本身不该被顶掉。站内此前是原页跳转，点一只就丢了上下文，
 * 得按返回键才回得来。
 *
 * 新窗口这件事对读屏用户尤其要交代。焦点毫无预告地跳进一个新窗口，
 * 读屏软件不会主动播报，人只会发现「返回键怎么按不动了」。
 * 这是 WCAG 3.2.5 要求提前告知的原因。
 */

describe("opening a stock", () => {
  it("opens in a new tab and says so for screen readers", () => {
    const html = renderToStaticMarkup(
      <InstrumentLink symbol="sh600519">贵州茅台</InstrumentLink>,
    );

    expect(html).toContain('href="/instruments/sh600519"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("贵州茅台");
    // 读屏念得到、眼睛看不到。
    expect(html).toContain("新窗口打开");
    expect(html).toContain("visually-hidden");
  });

  it("keeps the new window off the opener", () => {
    /*
     * 缺了 noopener，新开的那页能通过 window.opener 反过来改写原页地址。
     * 站内链接也一样：一个存量 XSS 就能借它把用户从行情页推去钓鱼页。
     */
    const html = renderToStaticMarkup(
      <InstrumentLink symbol="hk00700">腾讯控股</InstrumentLink>,
    );

    const rel = /rel="([^"]*)"/u.exec(html)?.[1] ?? "";
    expect(rel.split(/\s+/u)).toContain("noopener");
  });

  it("passes the caller's class through", () => {
    // 各处榜单的排版差别很大，样式必须由调用方决定。
    const html = renderToStaticMarkup(
      <InstrumentLink className="row-link" symbol="usaapl">
        苹果
      </InstrumentLink>,
    );

    expect(html).toContain("row-link");
  });

  it("refuses a symbol that is not a listing code", () => {
    /*
     * 拼接前先认一遍代码。任由调用方把任意字符串塞进地址，
     * 得到的是一条指向 404 的链接——而它看起来和真链接一模一样。
     */
    const html = renderToStaticMarkup(
      <InstrumentLink symbol="../../admin">危险</InstrumentLink>,
    );

    expect(html).not.toContain("<a");
    expect(html).toContain("危险");
  });
});
