import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomeScreen from "../app/index";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

const renderShell = (): string => renderToStaticMarkup(<HomeScreen />);

describe("mobile shell", () => {
  it("renders the 火球 brand with native heading semantics", () => {
    const markup = renderShell();

    expect(markup).toMatch(
      /\brole="heading"[^>]*>[\s\S]*火球[\s\S]*<\/[^>]+>/u,
    );
  });

  it("describes a neutral public-market information workspace", () => {
    expect(renderShell()).toContain("公开市场信息的观察与整理");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", (language) => {
    expect(renderShell()).not.toContain(language);
  });
});
