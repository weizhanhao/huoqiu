import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { D0Feed } from "../../../src/components/feed/feed-card";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("fixture-driven D0 feed", () => {
  it("renders the market strip and two content cards", () => {
    const fixture = readyFixture();
    const markup = renderToStaticMarkup(
      <D0Feed cards={fixture.feed} fixture={fixture} state="normal" />,
    );

    expect(markup).toContain("样本行情");
    expect(markup).toContain("星海智造");
    expect(markup).toContain("SYN001");
    expect(markup).toContain("108.64");
    expect(markup).toContain("合成市场的第一份观察");
    expect(markup).toContain("星海智造完成日内数据更新");
    expect(markup).toContain("样本数据 · 非实时，不构成投资建议");
  });

  it("renders stable loading, empty, and error states", () => {
    const fixture = readyFixture();

    expect(
      renderToStaticMarkup(
        <D0Feed cards={fixture.feed} fixture={fixture} state="loading" />,
      ),
    ).toContain("正在加载");
    expect(
      renderToStaticMarkup(
        <D0Feed cards={[]} fixture={fixture} state="empty" />,
      ),
    ).toContain("暂无演示内容");
    expect(
      renderToStaticMarkup(
        <D0Feed cards={fixture.feed} fixture={fixture} state="error" />,
      ),
    ).toMatch(/role="alert"[\s\S]*重试/u);
  });

  it("skips unknown cards and invokes the telemetry boundary", () => {
    const fixture = readyFixture();
    const onUnknownCard = vi.fn();
    const markup = renderToStaticMarkup(
      <D0Feed
        cards={[
          fixture.feed[1],
          {
            type: "recommendation",
            schema_version: 1,
            card_id: "card_unapproved_0001",
            published_at: "2026-08-08T05:50:00.000Z",
            source: "huoqiu-synthetic",
            permissions: {
              alpha_access: true,
              visibility: "alpha-public",
            },
            payload: { title: "不应渲染的卡片" },
          },
        ]}
        fixture={fixture}
        state="normal"
        onUnknownCard={onUnknownCard}
      />,
    );

    expect(markup).toContain("合成市场的第一份观察");
    expect(markup).not.toContain("不应渲染的卡片");
    expect(onUnknownCard).toHaveBeenCalledOnce();
    expect(onUnknownCard).toHaveBeenCalledWith({
      cardId: "card_unapproved_0001",
      reason: "unsupported-or-invalid",
    });
  });
});
