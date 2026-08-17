import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 设备上的引擎比测试环境旧。
 *
 * 用例跑在 Node 上，真机跑的是 Hermes（React Native 自带）。Node 有而 Hermes
 * 没有的方法，写下去用例全绿、装到手机上整屏红——真实发生过：关注流用了
 * Array.prototype.toSorted，106 个用例一个都没拦住，扫码进来看到的是
 * 「toSorted is not a function」。
 *
 * 这道扫描就是补那个盲区。它不聪明——按文本找，不解析 AST——但它拦得住
 * 那次真实事故，而且加一条禁用方法只要改一行。
 *
 * 只列确定有问题的：ES2023 的「按副本改数组」一族、ES2024 的 groupBy 一族，
 * 以及 structuredClone。不确定的不往里加——一条会误报的规则最后会被人加注释
 * 绕过去，然后整道门就废了。
 */

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  /* ES2023 change-array-by-copy */
  ".toSorted(",
  ".toReversed(",
  ".toSpliced(",
  /* ES2024 */
  "Object.groupBy(",
  "Map.groupBy(",
  "Array.fromAsync(",
  /* 结构化克隆是浏览器与 Node 的东西，Hermes 里没有 */
  "structuredClone(",
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

/*
 * 注释里提到方法名是允许的——修复处的说明里就写着「不能用 toSorted」，
 * 把它算成违规等于禁止解释为什么禁止。
 */
const isComment = (line: string): boolean => {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*")
  );
};

describe("runtime methods the device engine actually has", () => {
  it("uses nothing Hermes lacks in shipped mobile code", () => {
    const offenders: string[] = [];

    for (const directory of ["app", "src"]) {
      for (const file of sourceFiles(join(mobileRoot, directory))) {
        const lines = readFileSync(file, "utf8").split("\n");
        for (const method of FORBIDDEN) {
          const used = lines.some(
            (line) => line.includes(method) && !isComment(line),
          );
          if (used) {
            offenders.push(`${file.slice(mobileRoot.length + 1)}: ${method}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("names a replacement for every forbidden method", () => {
    /*
     * 拦住之后要有出路。没有替代写法的话，下一个撞上的人只会把这条用例
     * 删掉——而删掉它比违规本身更糟。
     */
    const replacements: Readonly<Record<string, string>> = {
      ".toReversed(": "[...array].reverse()",
      ".toSorted(": "[...array].sort()",
      ".toSpliced(": "先复制再 splice",
      "Array.fromAsync(": "for await 循环收集",
      "Map.groupBy(": "reduce 进 Map",
      "Object.groupBy(": "reduce 进普通对象",
      "structuredClone(": "按结构手写复制，或 JSON 往返（注意会丢 Date）",
    };

    expect(Object.keys(replacements).sort()).toEqual([...FORBIDDEN].sort());
  });
});
