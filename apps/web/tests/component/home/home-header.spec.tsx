import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellHeader } from "../../../src/components/shell/shell-header";

describe("home header", () => {
  it("only exposes product capabilities that exist in the top bar", () => {
    const markup = renderToStaticMarkup(<ShellHeader />);

    const actions = /<nav class="top-actions"[^>]*>([\s\S]*?)<\/nav>/u.exec(
      markup,
    )?.[1];

    expect(actions).toBeDefined();
    expect(actions).toContain('aria-label="消息"');
    expect(actions).toContain("设置");
    expect(actions).not.toContain("AI 投资助手");
    expect(actions).not.toContain("下载App");
    expect(actions).not.toContain("关于火球");
    expect(actions?.match(/<(?:a|button)\b/gu)).toHaveLength(4);
    expect(actions).toContain('role="menuitem" href="/settings"');
    expect(actions).toContain('aria-label="退出账号"');
  });
});
