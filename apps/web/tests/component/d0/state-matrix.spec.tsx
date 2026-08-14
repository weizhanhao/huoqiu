import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageState } from "../../../src/components/system/page-state";

describe("D0 Web page state matrix", () => {
  it("renders normal content without state chrome", () => {
    const markup = renderToStaticMarkup(
      <PageState state="normal">
        <p>正常内容</p>
      </PageState>,
    );

    expect(markup).toContain("正常内容");
    expect(markup).not.toContain("aria-busy");
  });

  it("renders an accessible stable loading state", () => {
    const markup = renderToStaticMarkup(<PageState state="loading" />);

    /*
     * aria-busy 不能和 role="status" 挂在同一个节点上：aria-busy 的意思正是
     * 「这块正在变，先别处理它的更新」，等于把自己的播报堵死。现在播报独立
     * 成一个 role="status"，aria-busy 挂在被替换的骨架上。
     */
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("正在加载");
    expect(markup).not.toMatch(/role="status"[^>]*aria-busy/u);
    expect(markup).not.toMatch(/aria-busy[^>]*role="status"/u);
  });

  it("renders an explicit empty state", () => {
    const markup = renderToStaticMarkup(
      <PageState state="empty" emptyMessage="暂无演示内容" />,
    );

    /*
     * 空态不再挂 role="status"：它首屏就在 DOM 里、没有变化可播，挂上去
     * 只是白白多一块常驻 live region，之后任何文案改动都会打断朗读。
     */
    expect(markup).not.toContain('role="status"');
    expect(markup).toContain("暂无演示内容");
  });

  it("renders an alert and retry control for errors", () => {
    const markup = renderToStaticMarkup(
      <PageState state="error" errorMessage="演示数据校验失败" />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("演示数据校验失败");
    expect(markup).toMatch(/<button\b[^>]*>重试<\/button>/u);
  });
});
