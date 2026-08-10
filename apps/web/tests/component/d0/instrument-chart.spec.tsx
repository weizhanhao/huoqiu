import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import InstrumentPage from "../../../src/app/instruments/[listingId]/page";
import { PriceChart } from "../../../src/components/instrument/price-chart";
import { QuoteHeader } from "../../../src/components/instrument/quote-header";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 instrument detail", () => {
  it("keeps the active chart tab and explains the unavailable detail tab", async () => {
    const page = await InstrumentPage({
      params: Promise.resolve({ listingId: "listing_syn_0001" }),
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        {page}
      </D0WatchlistProvider>,
    );

    expect(markup).toContain('aria-current="page">走势</span>');
    expect(markup).toContain('aria-label="演示说明，暂未开放"');
    expect(markup).toMatch(
      /aria-label="演示说明，暂未开放"[\s\S]*此功能暂未开放/u,
    );
  });

  it("discloses quote identity, market metadata, source, and snapshot", () => {
    const fixture = readyFixture();
    const instrument = fixture.instruments[0];
    const quote = fixture.quotes[0];
    if (instrument === undefined || quote === undefined) {
      throw new Error("Expected one synthetic listing and quote");
    }

    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={[instrument.listing_id]}>
        <QuoteHeader instrument={instrument} quote={quote} />
      </D0WatchlistProvider>,
    );

    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain("CN · CNY · 交易中");
    expect(markup).toContain("huoqiu-synthetic");
    expect(markup).toContain("2026-08-08T06:00:00.000Z");
    expect(markup).toContain("演示数据");
  });

  it("renders an accessible 20-point synthetic candlestick chart", () => {
    const fixture = readyFixture();
    const series = fixture.bars[0];
    if (series === undefined) {
      throw new Error("Expected one synthetic bar series");
    }

    const markup = renderToStaticMarkup(
      <PriceChart
        instrumentName="合成示例一号"
        points={series.points}
        state="normal"
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain("合成示例一号 20 个日 K 点");
    expect(markup.match(/data-bar-index=/gu)).toHaveLength(20);
    expect(markup).toContain("2026-07-20");
    expect(markup).toContain("2026-08-08");
    expect(markup).toContain("成交量");
  });

  it("does not draw a fabricated chart for empty or error states", () => {
    const emptyMarkup = renderToStaticMarkup(
      <PriceChart instrumentName="合成示例一号" points={[]} state="normal" />,
    );
    const errorMarkup = renderToStaticMarkup(
      <PriceChart instrumentName="合成示例一号" points={[]} state="error" />,
    );

    expect(emptyMarkup).toContain("暂无日 K 演示数据");
    expect(emptyMarkup).not.toContain("<svg");
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).not.toContain("<svg");
  });
});
