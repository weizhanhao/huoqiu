import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InstrumentDetail } from "../../../src/components/d0/instrument-detail";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 mobile instrument detail", () => {
  it("renders quote identity, source, snapshot, and all 20 bars", () => {
    const fixture = readyFixture();
    const markup = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        <InstrumentDetail
          fixture={fixture}
          listingId="listing_syn_0001"
          state="normal"
        />
      </D0WatchlistProvider>,
    );

    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain("CN · CNY · 交易中");
    expect(markup).toContain("huoqiu-synthetic");
    expect(markup).toContain("2026-08-08T06:00:00.000Z");
    expect(markup).toContain("演示数据");
    expect(markup.match(/data-testid="d0-candle-/gu)).toHaveLength(20);
    expect(markup).toContain("20 个日 K 点");
    expect(markup).toContain("加自选");
  });

  it("does not draw a fabricated chart for empty or error states", () => {
    const fixture = readyFixture();
    const empty = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        <InstrumentDetail
          fixture={fixture}
          listingId="listing_syn_0001"
          state="empty"
        />
      </D0WatchlistProvider>,
    );
    const error = renderToStaticMarkup(
      <D0WatchlistProvider knownListingIds={["listing_syn_0001"]}>
        <InstrumentDetail
          fixture={fixture}
          listingId="listing_syn_0001"
          state="error"
        />
      </D0WatchlistProvider>,
    );

    expect(empty).toContain("暂无日 K 演示数据");
    expect(empty).not.toContain("d0-candle-");
    expect(error).toContain("日 K 演示数据校验失败");
    expect(error).not.toContain("d0-candle-");
  });
});
