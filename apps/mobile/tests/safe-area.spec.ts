import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 顶部高度不能写死。
 *
 * 状态栏高度是机型属性：灵动岛机型 59，iPhone SE 20。写一个 52 上去，前者少了
 * 7 点——搜索框和返回键有一截压在灵动岛底下，点不到；后者多出 32 点空白。两种
 * 表现都不会报错，也不会让任何用例变红，只有拿着那台手机的人看得见。
 *
 * 这道扫描按文本找，不解析 AST——不聪明，但拦得住「又写了一个 52」。真正的
 * 高度由 useSafeAreaInsets() 在运行时给。
 */

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* 这几个数字都曾以「状态栏大概这么高」的名义出现在代码里。 */
const HARDCODED_TOP_INSETS = [
  "paddingTop: 44",
  "paddingTop: 47",
  "paddingTop: 50",
  "paddingTop: 52",
  "paddingTop: 54",
  "paddingTop: 59",
  "marginTop: 44",
  "marginTop: 52",
  "marginTop: 59",
] as const;

const sourceFiles = (directory: string): readonly string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...sourceFiles(path));
      continue;
    }
    if (/\.tsx?$/u.test(entry.name)) found.push(path);
  }
  return found;
};

const isComment = (line: string): boolean => {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*")
  );
};

describe("safe area", () => {
  it("never guesses the status bar height", () => {
    const offenders: string[] = [];

    for (const directory of ["app", "src"]) {
      for (const file of sourceFiles(join(mobileRoot, directory))) {
        const lines = readFileSync(file, "utf8").split("\n");
        for (const guess of HARDCODED_TOP_INSETS) {
          if (lines.some((line) => line.includes(guess) && !isComment(line))) {
            offenders.push(`${file.slice(mobileRoot.length + 1)}: ${guess}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("asks the system on every screen that draws its own top bar", () => {
    /*
     * 自己画顶栏的屏必须问系统要安全区。漏掉的那一屏不会崩，只是它的返回键
     * 在灵动岛底下——而这种问题只有拿着那台手机的人看得见。
     */
    const offenders: string[] = [];

    for (const directory of ["app", "src"]) {
      for (const file of sourceFiles(join(mobileRoot, directory))) {
        /* D0 与 five-tab 那批组件不在任何路由里，用户看不到。 */
        if (file.includes("/components/d0/")) continue;
        if (file.includes("/components/five-tab/")) continue;

        const source = readFileSync(file, "utf8");
        if (!source.includes("styles.topbar")) continue;
        if (source.includes("useSafeAreaInsets")) continue;
        offenders.push(file.slice(mobileRoot.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });
});
