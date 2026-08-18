import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InstrumentLive } from "../../../src/api/market-api";
import { InstrumentScreen } from "../../../src/components/instrument/instrument-screen";

/*
 * 个股页读的是服务端真实回包，不是我们手写的类型。
 *
 * 这一页曾经整屏红：`Cannot read property 'toFixed' of undefined`。原因不是
 * 某处忘了判空，而是移动端那份 InstrumentLive 是照着想象写的——它说涨跌额、
 * 名称、昨收在 quote 里，服务端却把这三样放在 metrics 里，quote 里的昨收还叫
 * prevClose。类型撒的谎编译期看不出来（回包是 JSON.parse 出来的 any），
 * 到了渲染那一刻才变成 undefined.toFixed()。
 *
 * 所以这份用例喂的是从服务器上原样抓下来的回包，不是手捏的对象——手捏的对象
 * 会照着我们的类型捏，于是永远和类型一致，永远发现不了类型撒谎。
 */

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../fixtures/instrument-live-sh600519.json", import.meta.url),
    ),
    "utf8",
  ),
) as InstrumentLive;

const render = (
  overrides: Partial<Parameters<typeof InstrumentScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <InstrumentScreen
      announcements={[]}
      announcementsFailure={null}
      chart={null}
      chartFailure={null}
      chartLoading={false}
      discussions={[]}
      metrics={fixture.metrics}
      onBack={vi.fn()}
      onCompose={vi.fn()}
      onOpenAnnouncement={vi.fn()}
      onOpenPost={vi.fn()}
      onOpenReport={vi.fn()}
      reports={[]}
      reportsFailure={null}
      onSelectPeriod={vi.fn()}
      onSelectTab={vi.fn()}
      onShowNotice={vi.fn()}
      onToggleWatchlist={vi.fn()}
      period="intraday"
      quote={fixture.quote}
      quoteFailure={null}
      symbol="sh600519"
      tab="discussion"
      tape={fixture.tape}
      watchlisted={false}
      {...overrides}
    />,
  );

describe("instrument screen", () => {
  it("renders the real payload without crashing", () => {
    /* 回包里每一样都在，页面上就不该出现「取不到」的破折号占位。 */
    const markup = render();

    expect(markup).toContain("贵州茅台");
    expect(markup).toContain("1293.09");
    /* 涨跌额和涨跌幅——就是当初红屏的那两个。 */
    expect(markup).toContain("-48.90");
    expect(markup).toContain("-3.64%");
  });

  it("reads 昨收 from the field the server actually uses", () => {
    /*
     * 服务端在 quote 里管昨收叫 prevClose，不是 previousClose——取错名字不会
     * 报错，只会让它静静地变成一个破折号。
     *
     * 指标区里已经没有「昨收」这一格了（它就是 现价 − 涨跌额，两个数都在正
     * 上方），所以改从分时图的中位刻度上验：那条刻度画的就是昨收。
     */
    const markup = render({
      chart: {
        kind: "line",
        period: "intraday",
        points: [
          { averagePrice: 1340, price: 1340, time: "09:30", volumeShares: 100 },
          { averagePrice: 1345, price: 1350, time: "15:00", volumeShares: 100 },
        ],
      },
    });

    expect(markup).toContain("1341.99");
  });

  it("shows the order book and the tape", () => {
    /*
     * 五档和明细服务端一直在回，移动端此前一个字都没接——看盘的人盯的就是
     * 这两块，缺了它这一页只是一张静态卡片。
     */
    const markup = render();

    expect(markup).toContain("五档");
    expect(markup).toContain("卖一");
    expect(markup).toContain("买一");
    /* 卖一价，以及那一档的挂单量——上游给的 15313 股按 A 股习惯读成 153 手。 */
    expect(markup).toContain("1293.09");
    expect(markup).toContain(">153<");
    expect(markup).toContain("明细");
    expect(markup).toContain("15:27:10");
  });

  it("labels announcements by category, not by company name", () => {
    /*
     * 公告页签此前印的是「公司名 · 日期」——因为那份数据来自全市场公告流，
     * 每一行都是别人家的公司。现在按标的查，一整页都是这一家的，再写一遍
     * 名字是废话；有用的是类目。
     */
    const markup = render({
      announcements: [
        {
          category: "定期报告",
          href: "https://data.eastmoney.com/notices/detail/600519/AN1.html",
          publishedOn: "2026-08-18",
          title: "贵州茅台2026年半年度报告",
        },
      ],
      tab: "announcements",
    });

    expect(markup).toContain("贵州茅台2026年半年度报告");
    expect(markup).toContain("定期报告 · 2026-08-18");
  });

  it("drops an announcement with no title instead of listing a blank row", () => {
    /* 标题是这一行唯一的内容，缺了就是一行点得动、却不知道会打开什么的空白。 */
    const markup = render({
      announcements: [
        {
          category: null,
          href: "https://data.eastmoney.com/notices/detail/600519/AN2.html",
          publishedOn: null,
          title: null,
        },
      ],
      tab: "announcements",
    });

    expect(markup).not.toContain("AN2.html");
  });

  it("attributes a target price to the broker who published it", () => {
    /*
     * 目标价只印一个数，读起来像市场共识——而它是某一家券商在某一天的看法，
     * 隔壁那家可能给出完全不同的数。谁给的，必须和数字印在一起。
     */
    const markup = render({
      reports: [
        {
          href: "https://data.eastmoney.com/report/info/AP1.html",
          institution: "某某证券",
          publishedOn: "2026-08-18",
          rating: "买入",
          targetPrice: 1680,
          thisYearEps: 68.2,
          title: "贵州茅台：中报点评",
        },
      ],
      tab: "research",
    });

    expect(markup).toContain("贵州茅台：中报点评");
    expect(markup).toContain("某某证券 · 买入 · 2026-08-18");
    expect(markup).toContain("某某证券给出的目标价 1680.00");
  });

  it("separates a broker-less stock from an unfetched one", () => {
    /*
     * 「没有券商写过这只票」是一句关于这家公司的判断，「还没取到」不是。
     * 合成一句，网慢时每只票看起来都无人问津。
     */
    expect(render({ reports: null, tab: "research" })).toContain(
      "正在读取研报",
    );
    expect(render({ reports: [], tab: "research" })).toContain(
      "没有券商发过这只标的的研报",
    );
  });

  it("writes 破折号 rather than crashing when a block is missing", () => {
    /*
     * 停牌、或上游某一路超时，回包里 metrics / quote 会是 null——整条只少一块，
     * 不该整页红。
     */
    const markup = render({ metrics: null, quote: null, tape: null });

    expect(markup).toContain("—");
    expect(markup).toContain("SH600519");
  });
});
