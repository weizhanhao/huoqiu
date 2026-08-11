import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BriefingPage from "../../src/app/7x24/page";
import NewsDetailPage, {
  generateStaticParams,
} from "../../src/app/news/[newsId]/page";
import NewsPage from "../../src/app/news/page";

describe("finance information routes", () => {
  it("renders the public news hub with channels, absolute times, and detail links", async () => {
    const markup = renderToStaticMarkup(
      await NewsPage({ searchParams: Promise.resolve({}) }),
    );

    for (const channel of ["全部", "市场", "公司", "公告", "专栏"]) {
      expect(markup).toContain(`>${channel}</button>`);
    }
    expect(markup).toContain("财经资讯");
    expect(markup).toContain("星港制造合成订单样本保持韧性");
    expect(markup).toContain("2026-08-08 13:42 CST");
    expect(markup).toContain('href="/news/company_syn_starport_orders"');
    expect(markup).toContain("演示数据 / 合成数据");
    expect(markup).toContain("不构成投资建议");
  });

  it("keeps a local search deep link and renders an honest empty state", async () => {
    const markup = renderToStaticMarkup(
      await NewsPage({
        searchParams: Promise.resolve({
          channel: "company",
          q: "不存在的标的",
        }),
      }),
    );

    expect(markup).toContain('value="不存在的标的"');
    expect(markup).toMatch(
      /<button\b[^>]*aria-pressed="true"[^>]*>公司<\/button>/u,
    );
    expect(markup).toContain("没有匹配的合成资讯");
    expect(markup).not.toContain("星港制造合成订单样本保持韧性");
  });

  it("renders 7x24 briefs grouped by absolute date and time", () => {
    const markup = renderToStaticMarkup(<BriefingPage />);

    expect(markup).toContain("7×24 合成快讯");
    expect(markup).toContain('aria-label="2026-08-08 快讯"');
    expect(markup).toContain('aria-label="2026-08-07 快讯"');
    expect(markup).toContain("2026-08-08");
    expect(markup).toContain("14:32 CST");
    expect(markup).toContain("09:18 CST");
    expect(markup).toContain("18:05 CST");
    expect(markup).toContain('href="/news/brief_syn_afternoon_pulse"');
    expect(markup).toContain("演示数据 / 合成数据");
  });

  it("renders a fixed news detail with source, body, listings, topics, and risk", async () => {
    const markup = renderToStaticMarkup(
      await NewsDetailPage({
        params: Promise.resolve({ newsId: "company_syn_starport_orders" }),
      }),
    );

    expect(generateStaticParams()).toContainEqual({
      newsId: "company_syn_starport_orders",
    });
    expect(markup).toContain("星港制造合成订单样本保持韧性");
    expect(markup).toContain("公司新闻");
    expect(markup).toContain("2026-08-08 13:42 CST");
    expect(markup).toContain("连续第三期位于合成景气区间");
    expect(markup).toContain('href="/instruments/listing_syn_0002"');
    expect(markup).toContain("先进制造");
    expect(markup).toContain("风险提示");
    expect(markup).toContain("分享（暂未开放）");
    expect(markup).toContain("收藏（仅本次会话）");
  });

  it("keeps briefing and news on distinct current global channels", async () => {
    const briefingMarkup = renderToStaticMarkup(<BriefingPage />);
    const newsMarkup = renderToStaticMarkup(
      await NewsPage({ searchParams: Promise.resolve({}) }),
    );
    const detailMarkup = renderToStaticMarkup(
      await NewsDetailPage({
        params: Promise.resolve({ newsId: "company_syn_starport_orders" }),
      }),
    );

    expect(briefingMarkup).toContain(
      '<a aria-current="page" href="/7x24">7x24</a>',
    );
    expect(newsMarkup).toContain(
      '<a aria-current="page" href="/news">资讯</a>',
    );
    expect(detailMarkup).toContain(
      '<a aria-current="page" href="/news">资讯</a>',
    );
  });
});
