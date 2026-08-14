import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InstrumentHits } from "../../../src/components/instrument/instrument-hits";

/*
 * 搜索页的标的结果。
 *
 * 这一段此前渲染的是 D0 夹具里的虚构公司——搜「茅台」一条都搜不到，
 * 搜出来的是「星海智造」，点进去 404。而真实的标的搜索一直都在
 * （searchInstruments，顶栏搜索框走的就是它），只是没接到这一页上。
 *
 * 三种结果要分清楚：搜到了、搜了但没有、以及上游没答应。
 * 后两种混为一谈，用户会把「上游挂了」读成「这只股票不存在」。
 */

const hit = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  code: "600519",
  href: "/instruments/sh600519",
  kind: "沪A",
  name: "贵州茅台",
  symbol: "sh600519",
  ...overrides,
});

describe("showing instrument search results", () => {
  it("links each hit to its own page", () => {
    const html = renderToStaticMarkup(
      <InstrumentHits hits={[hit()]} query="茅台" />,
    );

    expect(html).toContain("贵州茅台");
    expect(html).toContain("600519");
    expect(html).toContain('href="/instruments/sh600519"');
    // 和站内其他榜单一样，新开一页。
    expect(html).toContain('target="_blank"');
  });

  it("still shows a hit that has no page of its own", () => {
    /*
     * 上游认得的代码里有一部分站内渲染不出来（symbol 拼不出来时 href 是
     * null）。这种仍然要显示——用户至少知道这只标的存在、代码是多少，
     * 好过整条藏掉让人以为搜错了。只是它不该是一条点不开的链接。
     */
    const html = renderToStaticMarkup(
      <InstrumentHits
        hits={[
          hit({ href: null, kind: "英股", name: "汇丰控股", symbol: null }),
        ]}
        query="汇丰"
      />,
    );

    expect(html).toContain("汇丰控股");
    expect(html).not.toContain("<a");
  });

  it("tells an empty result apart from a broken upstream", () => {
    const empty = renderToStaticMarkup(
      <InstrumentHits hits={[]} query="不存在的东西" />,
    );
    expect(empty).toContain("没有找到");

    /*
     * hits 为 null 表示上游没答应。说成「没有找到」是在替上游撒谎——
     * 用户会以为这只股票不存在，而其实是过一分钟再搜就有了。
     */
    const broken = renderToStaticMarkup(
      <InstrumentHits hits={null} query="茅台" />,
    );
    expect(broken).not.toContain("没有找到");
    expect(broken).toContain("暂时取不到");
  });

  it("says nothing at all before anything is typed", () => {
    // 空查询不该显示「没有找到」——用户还没搜呢。
    const html = renderToStaticMarkup(<InstrumentHits hits={[]} query="" />);
    expect(html).not.toContain("没有找到");
  });
});
