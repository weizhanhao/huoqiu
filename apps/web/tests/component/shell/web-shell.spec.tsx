import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";

const renderShell = (): string =>
  renderToStaticMarkup(
    <DesktopShell>
      <p>页面内容</p>
    </DesktopShell>,
  );

const renderActiveShell = (activeChannel: "home" | "watchlist"): string =>
  renderToStaticMarkup(
    <DesktopShell activeChannel={activeChannel}>
      <p>页面内容</p>
    </DesktopShell>,
  );

describe("financial community web shell", () => {
  it("renders semantic header, centered content, and both desktop sidebars", () => {
    const markup = renderShell();

    expect(markup).toMatch(/<header\b[^>]*class="d0-topbar"/u);
    expect(markup).toMatch(/<aside\b[^>]*aria-label="用户与主导航"/u);
    expect(markup).toMatch(/<main\b[^>]*class="d0-main"/u);
    expect(markup).toMatch(/<aside\b[^>]*aria-label="社区行情与热榜"/u);
    expect(markup).toContain("演示行情");
    expect(markup).toContain("社区热榜");
    expect(markup).toContain("热门基金");
  });

  it("provides every global channel with a route or an explicit unavailable control", () => {
    const markup = renderShell();

    for (const channel of [
      "首页",
      "关注",
      "热门",
      "7x24",
      "自选",
      "视频",
      "基金",
      "资讯",
      "达人",
      "私募",
      "ETF",
    ]) {
      expect(markup).toContain(`>${channel}<`);
    }

    expect(markup).toContain('aria-label="全局频道"');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toMatch(/<details\b[^>]*class="unavailable-action"/u);
    expect(markup).toContain("此功能暂未开放");
    expect(markup).toContain("再次点击可收起");
  });

  it("marks only the active real channel as the current page", () => {
    const homeChannels =
      /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
        renderActiveShell("home"),
      )?.[1];
    const watchlistChannels =
      /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
        renderActiveShell("watchlist"),
      )?.[1];

    expect(homeChannels).toMatch(/<a aria-current="page" href="\/">首页<\/a>/u);
    expect(homeChannels).not.toMatch(/aria-current="page" href="\/watchlist"/u);
    expect(watchlistChannels).toMatch(
      /<a aria-current="page" href="\/watchlist">自选<\/a>/u,
    );
    expect(watchlistChannels).not.toMatch(/aria-current="page" href="\/"/u);
  });

  it("keeps search, watchlist, and synthetic instrument entry points working", () => {
    const markup = renderShell();

    expect(markup).toContain('action="/search"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain('href="/watchlist"');
    expect(markup).toContain('href="/instruments/listing_syn_0001"');
    expect(markup).toContain("演示数据");
    expect(markup).toContain("合成数据");
    expect(markup).toContain("不构成投资建议");
  });

  it("renders top actions and a five-item mobile navigation without dead buttons", () => {
    const markup = renderShell();

    expect(markup).toContain('aria-label="顶部功能"');
    expect(markup).toContain(">消息<");
    expect(markup).toContain(">发布<");
    expect(markup).toContain(">设置<");
    expect(markup).toContain('aria-label="移动端主导航"');

    for (const item of ["首页", "自选", "行情", "组合", "我的"]) {
      expect(markup).toContain(`>${item}<`);
    }

    expect(markup).not.toMatch(/<button\b(?![^>]*type="submit")[^>]*>/u);
  });

  it("routes every completed product surface instead of labelling it unavailable", () => {
    const markup = renderShell();

    expect(markup.match(/href="\/publish"/gu)).toHaveLength(2);
    expect(markup.match(/href="\/markets"/gu)).toHaveLength(2);
    expect(markup.match(/href="\/portfolios"/gu)).toHaveLength(2);
    expect(markup).toContain('href="/community"');
    expect(markup).not.toContain('aria-label="发布，暂未开放"');
    expect(markup).not.toContain('aria-label="写帖子，暂未开放"');
    expect(markup).not.toContain('aria-label="行情，暂未开放"');
    expect(markup).not.toContain('aria-label="组合，暂未开放"');
    expect(markup).not.toContain('aria-label="热门，暂未开放"');
  });

  it("defines a fixed mobile bottom bar and protects content from overlap", () => {
    const stylesheet = readFileSync(
      new URL("../../../src/app/globals.css", import.meta.url),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.mobile-bottom-nav[\s\S]*position: fixed/u,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.d0-layout[\s\S]*padding-bottom:/u,
    );
    expect(stylesheet).toContain("overflow-x: clip");
    const searchButtonBlock = /\.global-search button\s*\{([^}]*)\}/u.exec(
      stylesheet,
    )?.[1];
    const channelItemBlock =
      /\.channel-tabs > a,\s*\.channel-tabs > \.unavailable-action > summary\s*\{([^}]*)\}/u.exec(
        stylesheet,
      )?.[1];
    expect(searchButtonBlock).toContain("white-space: nowrap");
    expect(channelItemBlock).toContain("white-space: nowrap");
    expect(stylesheet).toContain('.channel-tabs > a[aria-current="page"]');
  });
});
