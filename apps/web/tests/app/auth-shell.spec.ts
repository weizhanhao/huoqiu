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
 * 现在它们在 (auth) 路由组下，用自己的极简外壳。这条断言防止有人顺手把
 * DesktopShell 加回去——加回去之后页面照样能打开、测试照样绿，
 * 只是又变回了那个满是干扰的样子。
 */

const authRoot = fileURLToPath(
  new URL("../../src/app/(auth)/", import.meta.url),
);
const appRoot = fileURLToPath(new URL("../../src/app/", import.meta.url));

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
       * DesktopShell 会带进侧栏、顶栏搜索和右栏推荐。
       * 登录这一屏只该有表单和一个回首页的出口。
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
});
