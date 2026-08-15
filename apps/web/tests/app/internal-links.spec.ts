import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 站内每一条写死的链接都得有路由接着。
 *
 * 创作者中心的两张列表都把帖子链到 /posts/{id}——站内根本没有这条路由，
 * 帖子的真实地址是 /community/posts/{id}。列表渲染正常、标题正常、鼠标
 * 移上去也是个正常的链接，点下去才是 404。同一处错误被复制了两份，
 * 说明光靠看是拦不住的。
 *
 * 类型系统管不了这件事：href 是字符串，拼错一个段落照样编译通过。
 */

const appRoot = fileURLToPath(new URL("../../src/app/", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));

/** app 目录里的路由，按路径段拆开；[x] 保留原样表示动态段。 */
const collectRoutes = async (
  directory: string,
  segments: readonly string[],
  into: string[][],
): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name === "page.tsx" || entry.name === "route.ts")
    ) {
      into.push([...segments]);
    }
    if (!entry.isDirectory()) continue;
    // _ 开头是私有目录，(x) 是路由组——两者都不出现在地址里。
    if (entry.name.startsWith("_")) continue;
    await collectRoutes(
      `${directory}${entry.name}/`,
      entry.name.startsWith("(") ? segments : [...segments, entry.name],
      into,
    );
  }
};

const segmentMatches = (routeSegment: string, actual: string): boolean =>
  routeSegment.startsWith("[") || routeSegment === actual;

const resolves = (
  routes: readonly (readonly string[])[],
  parts: readonly string[],
): boolean =>
  routes.some((route) => {
    const catchAll = route.findIndex((segment) => segment.startsWith("[..."));
    if (catchAll !== -1) {
      return (
        parts.length >= catchAll &&
        route
          .slice(0, catchAll)
          .every((segment, index) =>
            segmentMatches(segment, parts[index] ?? ""),
          )
      );
    }
    return (
      route.length === parts.length &&
      route.every((segment, index) =>
        segmentMatches(segment, parts[index] ?? ""),
      )
    );
  });

/*
 * 模板字面量只能取到 ${ 之前那一截，例如 `/instruments/${id}` 只看得到
 * /instruments。这种截断的前缀只要求「存在以它开头的更长路由」，否则
 * /instruments 会被误判成死链——站内确实没有 /instruments 这一页。
 */
const prefixResolves = (
  routes: readonly (readonly string[])[],
  parts: readonly string[],
): boolean =>
  routes.some(
    (route) =>
      route.length > parts.length &&
      parts.every((part, index) => segmentMatches(route[index] ?? "", part)),
  ) || resolves(routes, parts);

const collectSources = async (
  directory: string,
  into: string[],
): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await collectSources(`${directory}${entry.name}/`, into);
    } else if (/\.tsx?$/u.test(entry.name)) {
      into.push(`${directory}${entry.name}`);
    }
  }
};

describe("every hard-coded internal link has a route behind it", () => {
  it("finds no href pointing at a path this app does not serve", async () => {
    const routes: string[][] = [];
    await collectRoutes(appRoot, [], routes);
    /*
     * 守卫本身失效时要看得出来。路由一条都没收集到时下面的断言会全绿——
     * 一道永远通过的守卫比没有守卫更糟，因为它看着像在守。
     */
    expect(routes.length).toBeGreaterThan(50);

    const files: string[] = [];
    await collectSources(sourceRoot, files);

    const dead: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      /* href="/x"、href={`/x/${id}`}、以及夹具里的 href: "/x" 三种写法。 */
      const pattern = /href[=:]\s*\{?\s*[`"](\/[^`"$?#]*)(\$)?/gu;
      let match = pattern.exec(source);
      while (match !== null) {
        const path = (match[1] ?? "").replace(/\/$/u, "");
        const parts = path.split("/").filter((part) => part.length > 0);
        if (parts.length > 0) {
          const ok =
            match[2] === "$"
              ? prefixResolves(routes, parts)
              : resolves(routes, parts);
          if (!ok) {
            const line = source.slice(0, match.index).split("\n").length;
            dead.push(`${file.slice(sourceRoot.length)}:${line} → ${path}`);
          }
        }
        match = pattern.exec(source);
      }
    }

    expect(dead).toEqual([]);
  });
});
