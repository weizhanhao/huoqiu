import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { SyntheticInstrumentDetail } from "../../../src/features/market-portfolio/synthetic-instrument-detail";
import {
  syntheticListings,
  type SyntheticListing,
} from "../../../src/features/market-portfolio/synthetic-data";
import { D0WatchlistProvider } from "../../../src/stores/d0-watchlist";

const listing = syntheticListings[1];

const renderInstrument = (candidate: SyntheticListing = listing) =>
  renderToStaticMarkup(
    <D0WatchlistProvider
      knownListingIds={syntheticListings.map(
        (candidate) => candidate.listingId,
      )}
    >
      <SyntheticInstrumentDetail listing={candidate} />
    </D0WatchlistProvider>,
  );

describe("synthetic instrument detail", () => {
  it("renders a dense quote with signed, textual synthetic metrics", () => {
    const markup = renderInstrument();

    expect(markup).toContain("星港制造");
    expect(markup).toContain("+1.96");
    expect(markup).toContain("+4.82%");
    expect(markup).toContain("今开");
    expect(markup).toContain("最高");
    expect(markup).toContain("最低");
    expect(markup).toContain("昨收");
    expect(markup).toContain("成交量");
    expect(markup).toContain("52 周最高");
    expect(markup).toContain("2026-08-07 14:20");
    expect(markup).toContain("固定合成数据");
    expect(markup).toContain("不构成投资建议");
    expect(markup).toContain("不提供交易能力");
  });

  it("renders five real period controls and an accessible chart summary", () => {
    const markup = renderInstrument();

    for (const label of ["分时", "五日", "日 K", "周 K", "月 K"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain("分时走势：12 个固定合成采样点");
    expect(markup).toContain("成交量柱状图");
  });

  it("keeps a declining listing signed and described as declining", () => {
    const markup = renderInstrument(syntheticListings[6]);

    expect(markup).toContain("-3.15%");
    expect(markup).toContain("下跌 · 固定合成数据");
    expect(markup).toContain("区间末值 -3.15%");
    expect(markup).not.toContain("区间末值 +4.82%");
  });

  it("renders five detail tabs and the discussion content entry points", () => {
    const markup = renderInstrument();

    for (const label of ["讨论", "成分股", "资讯", "公告", "相关 ETF"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toContain("最新");
    expect(markup).toContain("最热");
    expect(markup).toContain("合成观察员");
    expect(markup).toContain("关注");
    expect(markup).toContain("分享");
    expect(markup).toContain("评论");
    expect(markup).toContain("点赞");
    expect(markup).toContain('href="/publish"');
    expect(markup).toContain("发讨论");
    expect(markup).toContain("问 AI");
  });
});
