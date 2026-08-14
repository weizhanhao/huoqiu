import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StockRail } from "../../../src/components/instrument/stock-rail";

/*
 * 涨跌配色。
 *
 * 这一条守的是一个只在浏览器里才看得出来的失效：CSS 优先级。
 *
 * 右栏的涨跌幅挂在 `.peerQuote small` 里，那条规则是 (0,1,1)，而 `.up`
 * 只有 (0,1,0)——三级灰一直在赢，于是「+20.01%」和「-1.40%」在屏上是
 * 同一个颜色。着色的代码写了、class 也传了，就是从来没生效过。
 * 图表左轴刻度是同一个病：`.axis text` 压着 `.up`/`.down`。
 *
 * 这种失效不报错、不留痕，渲染出来的 HTML 也完全正确——是取计算样式
 * （getComputedStyle）才发现的。所以这里只能守住「class 确实挂上去了」，
 * 颜色是否真的赢过灰色，由 CSS 里那两条提高优先级的选择器负责。
 */

const PEERS = {
  peers: [
    { changePercent: 20.01, last: 53.56, name: "涨的", symbol: "sh688286" },
    { changePercent: -1.4, last: 22.47, name: "跌的", symbol: "sz301348" },
    { changePercent: 0, last: 10, name: "平的", symbol: "sh600000" },
  ],
  sectorCode: "BK1036",
  sectorName: "半导体",
};

describe("up and down have to look different", () => {
  it("marks a rising and a falling peer with different classes", () => {
    const html = renderToStaticMarkup(
      <StockRail fundHoldings={[]} profile={null} sectorPeers={PEERS} />,
    );

    const rising = /\+20\.01%/u.exec(html)?.index ?? -1;
    const falling = /-1\.40%/u.exec(html)?.index ?? -1;
    expect(rising).toBeGreaterThan(-1);
    expect(falling).toBeGreaterThan(-1);

    /*
     * 两段各自往前找最近的 class 属性，必须不一样。相同就说明涨跌
     * 用的是同一个样式——那正是修之前的状态。
     */
    const classOf = (at: number): string =>
      [...html.slice(0, at).matchAll(/class="([^"]*)"/gu)].at(-1)?.[1] ?? "";
    expect(classOf(rising)).not.toBe(classOf(falling));
  });

  it("leaves a flat peer out of both tones", () => {
    // 不涨不跌不该被涂成红或绿——那是在给一个没有方向的数字加方向。
    const html = renderToStaticMarkup(
      <StockRail fundHoldings={[]} profile={null} sectorPeers={PEERS} />,
    );

    const flat = /0\.00%/u.exec(html)?.index ?? -1;
    const classOf = (at: number): string =>
      [...html.slice(0, at).matchAll(/class="([^"]*)"/gu)].at(-1)?.[1] ?? "";
    const rising = /\+20\.01%/u.exec(html)?.index ?? -1;

    expect(classOf(flat)).not.toBe(classOf(rising));
  });
});
