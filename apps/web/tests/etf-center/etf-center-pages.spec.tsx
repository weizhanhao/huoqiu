import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EtfsPage from "../../src/app/etfs/page";

/*
 * ETF 中心。
 *
 * 这一页此前列的是九只虚构 ETF（etf_syn_0001…），代码、净值、规模全是编的，
 * 页脚还写着「不连接真实行情」——而站内其实早就能渲染真实 ETF 的行情与日线
 * （/instruments/sh510300）。假的那份有入口，真的那份没有。
 *
 * 现在列的是真实 ETF。这一份守两件事：那九只样本不许再出现；
 * 页面不许再声称自己不连接真实行情，因为它现在连了。
 */

describe("ETF center routes", () => {
  it("no longer offers the nine invented ETFs", async () => {
    const markup = renderToStaticMarkup(
      await EtfsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain("ETF 中心");
    expect(markup).not.toContain("etf_syn_000");
    expect(markup).not.toContain("样本数据 · 非实时");
    expect(markup).not.toContain("不连接真实行情");
    /*
     * 页面上不能出现买入入口。
     *
     * 原来这里断言的是「不提供交易」那句说明文案，而说明文案是会随产品调整
     * 的；真正不能变的是**站内没有交易能力，就不该摆一个点了没反应的按钮**。
     * 所以改成直接断言那个按钮不存在。
     */
    expect(markup).not.toContain("买入");
    expect(markup).not.toContain("卖出");
  });

  it("keeps the deep-linked ordering from the address bar", async () => {
    const markup = renderToStaticMarkup(
      await EtfsPage({ searchParams: Promise.resolve({ sort: "change" }) }),
    );

    // 「涨幅」那一项应当是选中态，而不是回落到默认的成交额。
    expect(markup).toMatch(/aria-pressed="true"[^>]*>涨幅/u);
  });
});
