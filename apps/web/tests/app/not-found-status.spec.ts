import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 404 页面必须以 404 状态码送出。
 *
 * 之前 src/app/loading.tsx 在根部套了一层 Suspense：外壳带着 200 先流出去，
 * 之后页面里的 notFound() 再也改不动状态码。实测——
 *
 *   GET /users/does_not_exist            → 200（页面内容是 404）
 *   GET /instruments/sh000001/profile    → 200（页面内容是 404）
 *   GET /this-route-does-not-exist       → 404（没有匹配路由，Next 直接返回）
 *
 * 也就是说：应用里每一处 notFound() 都在用 200 送出「页面不存在」，只有
 * 完全不匹配任何路由的地址才是对的。搜索引擎会把这些页面当正常页面收录，
 * 任何按状态码判断的客户端都会误读。删掉那个 loading.tsx 之后四条全部正确。
 *
 * 注释拦不住这件事——下次想加骨架屏的人会直接在根上新建 loading.tsx，
 * 而症状（内容对、状态码错）在浏览器里完全看不出来。所以写成断言。
 */

const appRoot = fileURLToPath(new URL("../../src/app/", import.meta.url));

/*
 * 这一页里真的调了 notFound() 吗——注释里提到不算。
 *
 * 原先是 source.includes("notFound()") 直接匹配整份源码。两头都会错：
 * 注释里写一句「这里不能 notFound()」就被当成调了；反过来，谁把一行
 * notFound() 注释掉，这道守卫照样以为它还在，真正的回归被掩住。
 *
 * 先剥掉块注释和行注释，再匹配。
 */
const callsNotFound = (source: string): boolean =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/\/\/[^\n]*/gu, "")
    .includes("notFound()");

type Segment = Readonly<{ hasLoading: boolean; notFoundPages: string[] }>;

/** 收集一棵子树：其中有没有 loading.tsx，哪些 page 调了 notFound()。 */
const walk = async (directory: string, relative: string): Promise<Segment> => {
  const entries = await readdir(directory, { withFileTypes: true });
  let hasLoading = false;
  const notFoundPages: string[] = [];

  for (const entry of entries) {
    if (entry.name === "loading.tsx" && entry.isFile()) {
      hasLoading = true;
      continue;
    }
    if (entry.name === "page.tsx" && entry.isFile()) {
      const source = await readFile(`${directory}${entry.name}`, "utf8");
      if (callsNotFound(source)) {
        notFoundPages.push(`${relative}page.tsx`);
      }
      continue;
    }
    if (!entry.isDirectory()) continue;

    const nested = await walk(
      `${directory}${entry.name}/`,
      `${relative}${entry.name}/`,
    );
    // 父段的 loading.tsx 会把 Suspense 边界套到整棵子树上。
    if (nested.hasLoading) hasLoading = true;
    notFoundPages.push(...nested.notFoundPages);
  }

  return { hasLoading, notFoundPages };
};

/** 找出落在 loading 边界之下的所有 notFound() 页面。 */
const pagesUnderLoadingBoundary = async (
  directory: string,
  relative: string,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const hasLoading = entries.some(
    (entry) => entry.name === "loading.tsx" && entry.isFile(),
  );
  if (hasLoading) {
    // 这一段有边界，它底下的每一个 notFound() 都会被 200 盖住。
    return (await walk(directory, relative)).notFoundPages;
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    found.push(
      ...(await pagesUnderLoadingBoundary(
        `${directory}${entry.name}/`,
        `${relative}${entry.name}/`,
      )),
    );
  }
  return found;
};

describe("a page that says 404 must answer with 404", () => {
  it("keeps every notFound() page out from under a loading boundary", async () => {
    const trapped = await pagesUnderLoadingBoundary(appRoot, "");

    /*
     * 空数组，不是「数量少于几个」。
     *
     * 只要有一个 notFound() 落在 loading 边界之下，那条路由就会拿 200
     * 送出 404 页面——而这在界面上完全看不出来。
     */
    expect(trapped).toEqual([]);
  });

  it("still has pages that actually call notFound()", async () => {
    /*
     * 上一条断言在「全站没有任何 notFound()」时也会通过。
     * 这条确保它守的是真东西，不是一片空。
     */
    const all = await walk(appRoot, "");
    expect(all.notFoundPages.length).toBeGreaterThan(0);
  });
});
