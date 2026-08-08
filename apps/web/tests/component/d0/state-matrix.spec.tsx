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

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("正在加载演示数据");
  });

  it("renders an explicit empty state", () => {
    const markup = renderToStaticMarkup(
      <PageState state="empty" emptyMessage="暂无演示内容" />,
    );

    expect(markup).toContain('role="status"');
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
