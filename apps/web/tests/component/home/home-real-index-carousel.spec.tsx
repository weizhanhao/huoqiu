import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeRealIndexCarousel } from "../../../src/components/home/home-real-index-carousel";
import { MarketIndexStrip } from "../../../src/components/shell/market-index-strip";

describe("legacy home index entry", () => {
  it("delegates to the server-backed market component without a second data path", () => {
    expect(renderToStaticMarkup(<HomeRealIndexCarousel />)).toBe(
      renderToStaticMarkup(<MarketIndexStrip />),
    );
  });

  it("uses four switchable groups backed by real index and FX sources", () => {
    const markup = renderToStaticMarkup(<MarketIndexStrip />);

    expect(markup).toContain('aria-label="上一组指数"');
    expect(markup).toContain('aria-label="下一组指数"');
    expect(markup.match(/aria-label="第[1-4]组指数"/gu)).toHaveLength(4);
    expect(markup).toContain("上证指数");
    expect(markup).not.toContain("3962.17");
  });
});
