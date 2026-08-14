import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StockRail } from "../../../src/components/instrument/stock-rail";

/*
 * 个股页右栏。
 *
 * 雪球那一栏有简介、相关股票、相关基金。站内此前整条右栏都没有——个股页
 * 只有左边一列分区导航和中间的行情，右侧一大片空着。
 *
 * 这里守一件事：每一块都得有真数据才出现。三块都没有就整栏不渲染，
 * 而不是留三个空壳标题——空标题看着像加载失败，实际上是这只标的本来
 * 就没有那些资料（港美股拿不到 A 股的板块与 F10）。
 */

const PEERS = {
  peers: [
    { changePercent: 17.3, last: 52.35, name: "敏芯股份", symbol: "sh688286" },
    { changePercent: -1.2, last: 22.6, name: "蓝箭电子", symbol: "sz301348" },
  ],
  sectorCode: "BK1036",
  sectorName: "半导体",
};

describe("the stock page rail", () => {
  it("shows the profile, the sector peers and the funds holding it", () => {
    const html = renderToStaticMarkup(
      <StockRail
        fundHoldings={[
          {
            fundCode: "011103",
            name: "示例科技混合A",
            ratio: 9.52,
            reportedOn: "2026-06-30",
            shares: 1_200_000,
            value: 65_000_000,
          },
        ]}
        profile="示例公司成立于二〇〇一年，主营存储芯片的研发与销售。"
        sectorPeers={PEERS}
      />,
    );

    expect(html).toContain("简介");
    expect(html).toContain("主营存储芯片");
    expect(html).toContain("相关股票");
    expect(html).toContain("敏芯股份");
    // 同板块的名字要说出来，否则「相关」凭什么相关无从得知。
    expect(html).toContain("半导体");
    expect(html).toContain("相关基金");
    expect(html).toContain("示例科技混合A");
    // 每一只同板块个股都点得开，且和站内其他榜单一样新开一页。
    expect(html).toContain('href="/instruments/sh688286"');
    expect(html).toContain('target="_blank"');
  });

  it("drops a block that has no data instead of leaving a bare heading", () => {
    const html = renderToStaticMarkup(
      <StockRail fundHoldings={[]} profile={null} sectorPeers={PEERS} />,
    );

    expect(html).toContain("相关股票");
    // 空标题看着像加载失败，实际上是这只标的本来就没有这份资料。
    expect(html).not.toContain("简介");
    expect(html).not.toContain("相关基金");
  });

  it("tells a failed fetch apart from a block that is genuinely empty", () => {
    /*
     * 这两件事此前在界面上完全一样——都是那一块不出现。
     *
     * 长鑫科技确实没有基金持股（2024 年上市，公募季报里还没披露），
     * 而 F10 接口挂掉时长得一模一样。是查原始返回才分出来的：
     * loadShareholders 正常返回、fundHoldings 就是 0 条。用户没有这个手段。
     *
     * 「拿到了、是空的」照旧不渲染那一块；「没拿到」要说出来。
     */
    const empty = renderToStaticMarkup(
      <StockRail fundHoldings={[]} profile={null} sectorPeers={PEERS} />,
    );
    expect(empty).not.toContain("相关基金");

    const broken = renderToStaticMarkup(
      <StockRail
        failed={{ peers: false, profile: false, shareholders: true }}
        fundHoldings={[]}
        profile={null}
        sectorPeers={PEERS}
      />,
    );
    expect(broken).toContain("相关基金");
    expect(broken).toContain("暂时取不到");
  });

  it("still shows the rail when every block failed", () => {
    /*
     * 三块都没拿到时整栏不渲染是对的——前提是它们真的是空的。
     * 全都失败却整栏消失，用户看到的是「这只股票没有任何资料」。
     */
    const html = renderToStaticMarkup(
      <StockRail
        failed={{ peers: true, profile: true, shareholders: true }}
        fundHoldings={[]}
        profile={null}
        sectorPeers={null}
      />,
    );

    expect(html).not.toBe("");
    expect(html).toContain("暂时取不到");
  });

  it("renders nothing at all when there is nothing to show", () => {
    /*
     * 港美股拿不到 A 股的板块与 F10。整栏不渲染，让正文自己占满宽度——
     * 留一条空栏会把正文挤窄，换来的是一片空白。
     */
    const html = renderToStaticMarkup(
      <StockRail fundHoldings={[]} profile={null} sectorPeers={null} />,
    );

    expect(html).toBe("");
  });
});
