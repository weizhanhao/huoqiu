import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import RootLayout, { metadata } from "../src/app/layout";
import ModerationPage from "../src/app/moderation/page";
import AdminHomePage from "../src/app/page";

const renderShell = (): string =>
  renderToStaticMarkup(
    <RootLayout>
      <AdminHomePage />
    </RootLayout>,
  );

describe("admin shell", () => {
  it("renders the own-brand employee entry and no moderation data", () => {
    const markup = renderShell();

    expect(markup).toContain("火球");
    expect(markup).toMatch(/<h1\b[^>]*>员工审核入口<\/h1>/u);
    expect(markup).not.toMatch(/审核队列|待审内容|用户管理|行情管理/u);
    expect(markup).not.toContain("雪球");
  });

  it("keeps the entry and moderation route under the fixed admin prefix", () => {
    const markup = renderShell();

    expect(nextConfig.basePath).toBe("/admin");
    expect(nextConfig.assetPrefix).toBe("/admin");
    expect(markup).toContain('href="/moderation"');
    expect(markup).not.toContain('href="/admin/admin/moderation"');
  });

  it("defaults moderation access to deny before employee identity exists", () => {
    expect(() => ModerationPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
  });

  it("uses Chinese metadata for the internal 火球 surface", () => {
    expect(metadata.title).toBe("火球 · 员工审核");
    expect(renderShell()).toContain('<html lang="zh-CN">');
  });
});
