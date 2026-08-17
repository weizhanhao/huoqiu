import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SearchHit } from "../../../src/api/market-api";
import type { AccountSummary } from "../../../src/api/social-api";
import { ComposeScreen } from "../../../src/components/compose/compose-screen";

/*
 * 发帖器。
 *
 * 这一页的失败方式是「看着能用，发出去不是那么回事」：标题空着也能发、图还在
 * 传就先把帖子发了、插进去的股票记号点不动。守的是这几件。
 */

const account = (id: string, displayName: string): AccountSummary => ({
  createdAt: "2026-08-01T00:00:00.000Z",
  displayName,
  email: `${id}@example.com`,
  followerCount: 3,
  followingCount: 1,
  id,
  postCount: 2,
});

const hit = (
  code: string,
  name: string,
  symbol: string | null = `sh${code}`,
): SearchHit => ({
  code,
  href: symbol === null ? null : `/instruments/${symbol}`,
  kind: "沪A",
  name,
  symbol,
});

const render = (
  overrides: Partial<Parameters<typeof ComposeScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <ComposeScreen
      accounts={[account("acct_1", "林岸")]}
      body=""
      caret={null}
      cashtagFailure={null}
      cashtagQuery=""
      cashtagResults={null}
      failure={null}
      mode="discussion"
      onChangeBody={vi.fn()}
      onChangeCashtagQuery={vi.fn()}
      onChangeSelection={vi.fn()}
      onChangeTitle={vi.fn()}
      onClose={vi.fn()}
      onOpenPanel={vi.fn()}
      onPickAccount={vi.fn()}
      onPickCashtag={vi.fn()}
      onPickEmoji={vi.fn()}
      onPickImage={vi.fn()}
      onPickTopic={vi.fn()}
      onSelectMode={vi.fn()}
      onShowNotice={vi.fn()}
      onSubmit={vi.fn()}
      panel={null}
      publishing={false}
      title=""
      topics={["复盘"]}
      uploading={false}
      {...overrides}
    />,
  );

/*
 * 静态渲染里读不到 onPress，只能从 disabled 属性判断按钮能不能按——但必须
 * 认准是哪一个按钮。先前这里只在整页里找 aria-disabled，结果匹配上的是
 * 「插入图片」那个（上传时它也会禁用），于是「上传中不许发布」这条用例
 * 无论实现怎么写都通过。
 */
const publishDisabled = (markup: string): boolean => {
  const at = markup.indexOf('data-testid="compose-publish"');
  expect(at).toBeGreaterThan(-1);
  const tag = markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at));
  return tag.includes('aria-disabled="true"');
};

describe("compose screen", () => {
  it("offers both writing modes", () => {
    const markup = render();

    expect(markup).toContain("发讨论");
    expect(markup).toContain("写长文");
    expect(markup).not.toContain("雪球");
  });

  it("refuses to publish a long-form post with no title", () => {
    /*
     * 标题空着也放行的话，长文和短帖存进去一模一样，列表里那栏标题会拿正文
     * 头 24 个字顶上——而用户以为自己写的是一篇有标题的文章。
     */
    const untitled = render({ body: "正文写了不少", mode: "longform" });
    const titled = render({
      body: "正文写了不少",
      mode: "longform",
      title: "季报读后",
    });

    expect(publishDisabled(untitled)).toBe(true);
    expect(publishDisabled(titled)).toBe(false);
  });

  it("refuses to publish an empty body", () => {
    expect(publishDisabled(render({ body: "   " }))).toBe(true);
  });

  it("holds publishing until the photo finishes uploading", () => {
    /*
     * 图还在传就放行的话，帖子会先发出去，图片记号随后才插进输入框——而那
     * 一段正文已经没人在编辑了，图等于丢了。
     */
    const markup = render({ body: "看这张图", uploading: true });

    expect(publishDisabled(markup)).toBe(true);
  });

  it("lists real topics and real accounts in their panels", () => {
    expect(render({ panel: "topic" })).toContain("#复盘#");
    expect(render({ panel: "mention" })).toContain("@林岸");
  });

  it("leaves out instruments that have no in-app page", () => {
    /*
     * 插进正文的记号带着站内代码。拼不出代码的品种插进去只是一段死文字，
     * 点了没有反应——那正是这个产品此前最容易犯的错。
     */
    const markup = render({
      cashtagQuery: "测试",
      cashtagResults: [
        hit("600519", "贵州茅台"),
        hit("999999", "无页品种", null),
      ],
      panel: "cashtag",
    });

    expect(markup).toContain("贵州茅台");
    expect(markup).not.toContain("无页品种");
  });

  it("tells the difference between still searching and nothing found", () => {
    const searching = render({
      cashtagQuery: "茅台",
      cashtagResults: null,
      panel: "cashtag",
    });
    const empty = render({
      cashtagQuery: "茅台",
      cashtagResults: [],
      panel: "cashtag",
    });

    expect(searching).toContain("正在搜");
    expect(searching).not.toContain("没有匹配");
    expect(empty).toContain("没有匹配");
  });
  it("does not call a failed search an empty result", () => {
    /*
     * 手机没连上服务时，搜「贵州茅台」得到「没有匹配的标的」是一句明确的
     * 假话——用户会换词反复试，最后认定这个 App 里没有茅台。
     */
    const broken = render({
      cashtagFailure: "连不上服务器。确认手机和服务在同一个网络里。",
      cashtagQuery: "茅台",
      cashtagResults: null,
      panel: "cashtag",
    });

    expect(broken).toContain("连不上服务器");
    expect(broken).not.toContain("没有匹配");
  });
});
