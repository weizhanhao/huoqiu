import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";

/*
 * 导航选中态由地址决定，不再由页面传参——原先 /markets/rankings 传成
 * "markets"，人站在涨跌榜上点亮的是「行情」。所以这里设定地址而不是传参数。
 */
let currentPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const renderShell = (): string =>
  renderToStaticMarkup(
    <DesktopShell>
      <p>页面内容</p>
    </DesktopShell>,
  );

const renderActiveShell = (pathname: string): string => {
  currentPathname = pathname;
  return renderToStaticMarkup(
    <DesktopShell>
      <p>页面内容</p>
    </DesktopShell>,
  );
};

const renderNotificationShell = (): string => {
  currentPathname = "/notifications";
  return renderToStaticMarkup(
    <DesktopShell activeUtility="notifications">
      <p>页面内容</p>
    </DesktopShell>,
  );
};

describe("financial community web shell", () => {
  it("renders semantic header, centered content, and both desktop sidebars", () => {
    const markup = renderShell();

    expect(markup).toMatch(/<header\b[^>]*class="d0-topbar"/u);
    expect(markup).toMatch(/<aside\b[^>]*aria-label="用户与主导航"/u);
    expect(markup).toMatch(/<main\b[^>]*class="d0-main"/u);
    expect(markup).toMatch(/<aside\b[^>]*aria-label="社区行情与热榜"/u);
    /*
     * 「市场快照」那一块删掉了：它列的是虚构标的，涨跌色和正号还写死成上涨。
     * 市场概览现在由正文上方的指数条承担，那三张卡是沪深三大指数的真实行情。
     */
    expect(markup).not.toContain("市场快照");
    expect(markup).toContain("上证指数");
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

    // 11 个频道现在全部指向真实路由，频道栏内不再有占位控件。
    // 逐个校验 href 比原来「至少存在一个 unavailable-action」更强：
    // 后者在所有频道都做实之后永远为假，反而失去保护力。
    const channelNav = /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      markup,
    )?.[1];
    expect(channelNav).toBeDefined();
    for (const href of [
      "/",
      "/community/follow",
      "/community",
      "/7x24",
      "/watchlist",
      "/videos",
      "/funds",
      "/news",
      "/creators",
      "/private-funds",
      "/etfs",
    ]) {
      expect(channelNav).toContain(`href="${href}"`);
    }
    expect(channelNav).not.toMatch(/unavailable-action/u);
  });

  it("marks only the active real channel as the current page", () => {
    const homeChannels =
      /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
        renderActiveShell("/"),
      )?.[1];
    const watchlistChannels =
      /<nav class="channel-tabs"[^>]*>([\s\S]*?)<\/nav>/u.exec(
        renderActiveShell("/watchlist"),
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
    /*
     * 外壳里指向虚构标的的那个入口没有了。现在指数条上的三张卡各自通向
     * 一只真实指数的详情页。
     */
    expect(markup).not.toContain('href="/instruments/listing_syn_0001"');
    expect(markup).toContain('href="/instruments/sh000001"');
    // 外壳不再声称自己是样本数据，但「不构成投资建议」必须留着。
    expect(markup).not.toContain("样本数据");
    expect(markup).toContain("不构成投资建议");
  });

  it("renders top actions and a five-item mobile navigation without dead buttons", () => {
    const markup = renderShell();

    expect(markup).toContain('aria-label="顶部功能"');
    expect(markup).toContain(">消息<");
    /*
     * 顶栏那一项叫「发帖」不叫「发布」：它现在弹出一个写短帖的框，
     * 而「发布」在创作者中心另有所指（发布长文）。同一个词指两件事，
     * 用户会以为点它能写长文。
     */
    expect(markup).toContain(">发帖<");
    expect(markup).toContain(">设置<");
    expect(markup).toContain('aria-label="移动端主导航"');

    for (const item of ["首页", "自选", "行情", "组合", "我的"]) {
      expect(markup).toContain(`>${item}<`);
    }

    /*
     * 原断言是「壳层里除提交按钮外不得有任何 button」，用来防止死按钮。
     * 右栏热股榜引入了真实可用的市场 / 涨跌切换按钮后这条不再成立，
     * 于是改为直接检验它真正想守的东西：每个 button 都要显式声明 type，
     * 且交互按钮必须有**可观察的状态**，不能是哑巴。
     *
     * 可观察的状态有两种：切换类用 aria-pressed；打开弹框的用
     * aria-expanded（配合 aria-haspopup）。发帖按钮属于后者——读屏用户
     * 按下去之前要知道它会弹出对话框，按下去之后要知道它开着。
     * 只认 aria-pressed 的话，正确标注的弹框触发器反而通不过。
     */
    const buttons = [...markup.matchAll(/<button\b[^>]*>/gu)].map(
      ([tag]) => tag,
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const tag of buttons) {
      expect(tag).toMatch(/\stype="(button|submit)"/u);
      if (!tag.includes('type="submit"')) {
        expect(tag).toMatch(/\saria-(?:pressed|expanded)="/u);
      }
    }
  });

  it("exposes notifications on desktop and carries unread state on mobile My", () => {
    const markup = renderShell();

    // 顶栏 1 + 侧栏消息 1 + 侧栏二级项 4（回复 / @我 / 赞与收藏 / 系统消息）
    /*
     * 六个入口不变，但其中四个侧栏子链接现在带 ?category= 直达对应分类——
     * 过去它们全部指向同一个默认视图。正则放宽到允许查询串，计数不变。
     */
    expect(markup.match(/href="\/notifications(?:\?[^"]*)?"/gu)).toHaveLength(
      6,
    );
    expect(markup).toContain('href="/notifications?category=replies"');
    /*
     * 「我的」不再写死到内置样本用户：已登录指向本人主页，未登录指向 /login。
     * 服务端静态渲染出的是未登录态，所以这里顺带钉死整个外壳不得再出现
     * 写死的样本用户 id——地址栏上写着 demo 的链接不该发给真实用户。
     */
    expect(markup).toContain("<span>我的</span>");
    expect(markup).not.toContain("/users/user_demo_0001");
    expect(markup).not.toContain('aria-label="消息，暂未开放"');
    /*
     * 原先断言外壳里必须出现「未读通知」。那个徽标当时恒定显示 5，来自
     * 通知状态的默认样本——每一页都告诉访客「你有 5 条未读」，而那五件事
     * 一件都没发生过。默认没有通知时，徽标不该出现；消息入口本身仍在。
     */
    expect(markup).not.toContain("条未读通知");
  });

  it("marks desktop notifications and mobile My current on the notification route", () => {
    const markup = renderNotificationShell();

    /* 顶栏与侧栏各一条「消息」，停在通知页时两条都要标出来。 */
    expect(
      markup.match(
        /<a[^>]*aria-current="page"[^>]*href="\/notifications"[^>]*>/gu,
      ),
    ).toHaveLength(2);
    /*
     * 移动端底栏只有五格，消息归在「我的」那一格下；未登录时它落到 /login，
     * 当前页标记必须跟着走到那条链接上。
     */
    expect(markup).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/login"[^>]*>/u,
    );
  });

  it("routes every completed product surface instead of labelling it unavailable", () => {
    const markup = renderShell();

    /*
     * 三处：顶栏「发布」、侧栏「＋ 写帖子」、以及移动端发布浮动按钮。
     * 第三处是后加的——移动端隐藏了顶栏功能区和侧栏，原先手机上根本
     * 到不了发帖页。这条断言顺带把那个入口锁住，防止再被隐藏掉。
     */
    expect(markup.match(/href="\/publish"/gu)).toHaveLength(3);
    expect(markup).toContain('class="mobile-publish-fab"');
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
