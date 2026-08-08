import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../src/app/layout";
import HomePage from "../src/app/page";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

const renderShell = (): string =>
  renderToStaticMarkup(
    <RootLayout>
      <HomePage />
    </RootLayout>,
  );

describe("web shell", () => {
  it("renders the 火球 brand as the page heading", () => {
    const markup = renderShell();

    expect(markup).toMatch(/<h1\b[^>]*>[\s\S]*火球[\s\S]*<\/h1>/u);
    expect(metadata.title).toBe("火球");
  });

  it("describes a neutral public-market information workspace", () => {
    expect(renderShell()).toContain("公开市场信息的观察与整理");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", (language) => {
    expect(renderShell()).not.toContain(language);
  });
});
