import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 登录与注册是独立的一屏。
 *
 * 这两页一度套在整站外壳里：左侧导航、顶栏搜索、右栏的热股榜和热门基金
 * 全都在。那是自相矛盾的——一边让人登录，一边在旁边摆一排需要登录才能用
 * 的入口，注意力被扯散，而那些入口这时候点了也没用。
 *
 * 现在它们在 (auth) 路由组下，正文仍使用自己的聚焦外壳，但顶栏复用全站
 * SiteTopbar。这条断言防止有人把整套 DesktopShell 加回去，重新带入侧栏和
 * 右栏推荐。
 */

const authRoot = fileURLToPath(
  new URL("../../src/app/(auth)/", import.meta.url),
);
const appRoot = fileURLToPath(new URL("../../src/app/", import.meta.url));
const accountRoot = fileURLToPath(
  new URL("../../src/features/account/", import.meta.url),
);

const collectPages = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(...(await collectPages(`${directory}${entry.name}/`)));
      continue;
    }
    if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      found.push(`${directory}${entry.name}`);
    }
  }
  return found;
};

describe("the auth screens stand on their own", () => {
  it("keeps the site shell out of login and register", async () => {
    const files = await collectPages(authRoot);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      /*
       * DesktopShell 会带进侧栏与右栏推荐；登录页只复用同一条 SiteTopbar，
       * 正文仍只保留认证与真实行情上下文。
       */
      expect(source, file).not.toContain("DesktopShell");
    }
  });

  it("does not leave a second copy of these routes behind", async () => {
    const entries = await readdir(appRoot, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    /*
     * 同一条路由存在两处定义会让 Next 直接报冲突。
     * 迁移时忘了删旧位置，是这类改动最常见的收尾疏漏。
     */
    expect(names).not.toContain("login");
    expect(names).not.toContain("register");
  });

  it("uses the product brand and real market components instead of an auth-page mock", async () => {
    const layoutSource = await readFile(`${authRoot}layout.tsx`, "utf8");
    const shellStyles = await readFile(
      `${authRoot}auth-shell.module.css`,
      "utf8",
    );

    expect(layoutSource).toContain("SiteTopbar");
    expect(layoutSource).toContain('<SiteTopbar variant="auth" />');
    expect(layoutSource).toContain("RealIndexCards");
    expect(layoutSource).toContain("AuthHotBoard");
    expect(layoutSource).toContain("className={`d0-app-shell ${styles.page}`}");
    expect(layoutSource).not.toContain("mock");
    expect(layoutSource).not.toContain("fixture");

    // 桌面两栏、移动端表单优先，避免认证操作被行情内容压到首屏之外。
    expect(shellStyles).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(360px, 420px)",
    );
    expect(shellStyles).toContain("@media (max-width: 900px)");
    expect(shellStyles).toMatch(/\.formSlot\s*\{[^}]*order: 1;/u);
  });

  it("makes login and registration visibly different without advertising dead login methods", async () => {
    const layoutSource = await readFile(`${authRoot}layout.tsx`, "utf8");
    const loginSource = await readFile(`${authRoot}login/page.tsx`, "utf8");
    const experienceSource = await readFile(
      `${accountRoot}auth-experience.tsx`,
      "utf8",
    );
    const experienceStyles = await readFile(
      `${accountRoot}auth-experience.module.css`,
      "utf8",
    );

    expect(loginSource).not.toContain("LoginMethods");
    expect(experienceSource).toContain('aria-label="账号入口"');
    expect(experienceSource).toContain("registerForm");
    expect(experienceSource).toContain("loginForm");
    expect(experienceSource).toContain("encodeURIComponent(nextPath)");
    expect(experienceSource).toContain('const destination = nextPath ?? "/"');
    expect(experienceSource).toContain("router.replace(destination)");
    expect(experienceSource).not.toContain("查看我的主页");
    expect(experienceSource).not.toContain("退出登录");
    expect(experienceSource).toContain("请设置至少");
    expect(experienceSource).not.toContain("加盐散列");
    expect(layoutSource).not.toContain("加盐散列");
    expect(experienceStyles).toContain(".loginCard");
    expect(experienceStyles).toContain(".registerCard");
    expect(experienceStyles).toContain("counter-reset: register-field");
  });
});
