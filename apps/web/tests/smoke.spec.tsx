import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../src/app/layout";
import HomePage from "../src/app/page";
import { DesktopShell } from "../src/components/shell/desktop-shell";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

const renderShell = async (): Promise<string> =>
  renderToStaticMarkup(
    <RootLayout>
      {await HomePage({ searchParams: Promise.resolve({}) })}
    </RootLayout>,
  );

describe("web shell", () => {
  it("renders the 火球 brand as the page heading", async () => {
    const markup = await renderShell();

    expect(markup).toMatch(/<h1\b[^>]*>[\s\S]*火球[\s\S]*<\/h1>/u);
    expect(metadata.title).toBe("火球");
  });

  it("separates real-source finance from synthetic community content", async () => {
    const markup = await renderShell();

    expect(markup).toContain("真实财经来源");
    expect(markup).toContain("真实财经快照尚未生成");
    expect(markup).toContain("合成社区内容");
    expect(markup).toContain("本地受保护预览");
    expect(markup).not.toContain("当前使用演示数据和合成数据");
    expect(markup).not.toContain("合成示例一号完成日内数据更新");
  });

  it("keeps fixture-independent content visible when the D0 fixture fails", () => {
    const markup = renderToStaticMarkup(
      <DesktopShell
        fixtureResult={{ status: "error", message: "Fixture failure" }}
        requiresD0Fixture={false}
      >
        <section>真实来源仍然可用</section>
      </DesktopShell>,
    );

    expect(markup).toContain("真实来源仍然可用");
    expect(markup).not.toContain("Fixture failure");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", async (language) => {
    expect(await renderShell()).not.toContain(language);
  });
});
