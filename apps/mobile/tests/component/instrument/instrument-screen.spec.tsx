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
      etfs={[]}
      etfsFailure={null}
      metrics={fixture.metrics}
      onBack={vi.fn()}
      onCompose={vi.fn()}
      onOpenAnnouncement={vi.fn()}
      onOpenEtf={vi.fn()}
      onOpenPost={vi.fn()}
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
    /* 昨收在服务端叫 prevClose，取错名字会静静地变成一个破折号。 */
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
