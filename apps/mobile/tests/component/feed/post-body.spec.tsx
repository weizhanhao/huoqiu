import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PostBody } from "../../../src/components/feed/post-body";

/*
 * 帖子正文里的股票引用。
 *
 * 用户要的是：正文里提到一支股票，能点进 K 线，也能直接加自选。只渲染成蓝字
 * 却点不动，等于印了个假链接——那正是这个产品此前最容易犯的错。
 *
 * 解析规则本身由共享包的用例守（apps/web/tests/component/publish/
 * composer-tokens.spec.ts）；这里守的是「解析出来之后，界面上真的能操作」。
 */

const render = (
  body: string,
  overrides: Partial<Parameters<typeof PostBody>[0]> = {},
): string =>
  renderToStaticMarkup(
    <PostBody
      accounts={[{ displayName: "林岸", id: "acct_1" }]}
      body={body}
      onAddToWatchlist={vi.fn()}
      onOpenInstrument={vi.fn()}
      topics={["复盘"]}
      {...overrides}
    />,
  );

describe("post body", () => {
  it("turns a stock reference into both a jump and an add-to-watchlist", () => {
    const markup = render("今天看了 $贵州茅台(SH600519)$，先不动。");

    /* 正文里那一处：点它跳 K 线。 */
    expect(markup).toContain("$贵州茅台(SH600519)$");
    /* 单列出来的那一条：够大的点击目标，带加自选。 */
    expect(markup).toContain("加自选");
    expect(markup).toContain("贵州茅台(SH600519)");
  });

  it("does not add a watchlist row when there is no stock reference", () => {
    const markup = render("今天没动仓位，等季报。");

    expect(markup).not.toContain("加自选");
  });

  it("renders one watchlist row per referenced stock", () => {
    const markup = render(
      "$贵州茅台(SH600519)$ 和 $平安银行(SZ000001)$ 都看了。",
    );

    expect(markup.split("加自选").length - 1).toBe(2);
  });

  it("keeps an unknown topic readable but unlinked", () => {
    /*
     * 话题广场里没有的标签不给链接——链过去是一页空的。这条规则在共享解析器
     * 里，这里确认渲染层没有把它绕开。
     */
    const markup = render("#复盘# 和 #还没有的标签# 都写一下");

    expect(markup).toContain("复盘");
    expect(markup).toContain("还没有的标签");
  });

  it("does not present an off-site image as an attachment", () => {
    /*
     * 只认自家上传目录下的图片。放开成任意地址，等于让任何人往站内页面塞一个
     * 站外地址，把读者的访问记录送出去。
     */
    const markup = render("![](https://example.com/tracker.png)");

    expect(markup).not.toContain("[图片]");
  });

  it("lists an uploaded image as an explicit attachment line", () => {
    const markup = render("![](/api/social/uploads/abc.png)");

    expect(markup).toContain("[图片]");
    expect(markup).toContain("/api/social/uploads/abc.png");
  });
});
