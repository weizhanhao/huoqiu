import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeFeed } from "../../../src/components/d0/home-feed";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 mobile home feed", () => {
  it("renders synthetic market identity and the two approved content cards", () => {
    const markup = renderToStaticMarkup(
      <HomeFeed fixture={readyFixture()} state="normal" />,
    );

    expect(markup).toContain("演示数据");
    expect(markup).toContain("合成行情");
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain("合成市场的第一份观察");
    expect(markup).toContain("合成示例一号完成日内数据更新");
    expect(markup).toContain("huoqiu-synthetic");
    expect(markup).toContain("2026-08-08T06:00:00.000Z");
    expect(markup).toContain("演示数据，不构成投资建议");
  });

  it("renders loading, empty, and retryable error states without fake cards", () => {
    const fixture = readyFixture();
    const loading = renderToStaticMarkup(
      <HomeFeed fixture={fixture} state="loading" />,
    );
    const empty = renderToStaticMarkup(
      <HomeFeed fixture={fixture} state="empty" />,
    );
    const error = renderToStaticMarkup(
      <HomeFeed fixture={fixture} state="error" />,
    );

    expect(loading).toContain("正在加载演示数据");
    expect(empty).toContain("暂无演示内容");
    expect(error).toContain("演示数据校验失败");
    expect(error).toContain("重试");
    expect(error).not.toContain("合成市场的第一份观察");
  });
});
