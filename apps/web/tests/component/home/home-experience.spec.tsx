import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeCommunityFeed } from "../../../src/components/home/home-community-feed";
import { HomeMarketOverview } from "../../../src/components/home/home-market-overview";
import { HomeRightRail } from "../../../src/components/home/home-right-rail";

describe("recovered home experience", () => {
  it("keeps the watchlist inside the home center column", () => {
    const markup = renderToStaticMarkup(<HomeMarketOverview watchlistView />);

    expect(markup).toContain('class="home-optional home-optional-watchlist"');
    expect(markup).toContain('aria-label="添加自选股票"');
    expect(markup).toContain("添加到首页");
    expect(markup.match(/role="tab"/gu)).toHaveLength(3);
  });

  it("renders an arrow and dot controlled index carousel", () => {
    const markup = renderToStaticMarkup(<HomeMarketOverview />);

    expect(markup).toContain('aria-label="上一组指数"');
    expect(markup).toContain('aria-label="下一组指数"');
    expect(markup.match(/aria-label="第[1-4]组指数"/gu)).toHaveLength(4);
  });

  it("renders expandable posts and complete interaction controls", () => {
    const markup = renderToStaticMarkup(<HomeCommunityFeed />);

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain(">展开⌄</button>");
    expect(markup).toContain(">收藏</span>");
    expect(markup).toContain(">投诉</span>");
  });

  it("links every hot topic to a served topic page", () => {
    const markup = renderToStaticMarkup(<HomeRightRail />);

    expect(markup.match(/href="\/topics\//gu)).toHaveLength(10);
    expect(markup).toContain("CPO概念拉升，天孚通信大涨");
  });
});
