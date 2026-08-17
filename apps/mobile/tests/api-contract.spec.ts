import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 手机端发出去的每一个查询参数，服务端都得真的读。
 *
 * 这个 bug 出现过两次，两次都不报错、也不难看：
 *
 *   1. 个股页的「公告」传 ?symbol=sh600519，而那条路由是全市场公告流，
 *      symbol 收下了从不看——于是贵州茅台底下列着爱丽家居的公告。日期真、
 *      链接点得开、PDF 是原件，只有「这是这只票的」这一层是假的；
 *   2. 「相关ETF」传 ?symbol=，而 ETF 列表只认排序和翻页——每只股票点开，
 *      列的都是同一份全市场 ETF。
 *
 * 共同点是：请求 200，页面正常，每一行数据本身都真实。没有任何一处会露馅，
 * 除非有人拿两只不同的票各点一次、并且记得上一次看见了什么。
 *
 * 所以这里按文本对一遍：手机端拼进 URL 的参数名，必须在对应的路由文件里出现
 * 过。不解析 AST——不聪明，但这两次的错它都拦得住。
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const mobileApi = join(repoRoot, "apps", "mobile", "src", "api");
const webApi = join(repoRoot, "apps", "web", "src", "app", "api");

/** 手机端每条请求路径 → 它带上的查询参数名。 */
const parametersSent = (): ReadonlyMap<string, ReadonlySet<string>> => {
  const sent = new Map<string, Set<string>>();
  for (const file of readdirSync(mobileApi)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(mobileApi, file), "utf8");
    /* 双引号或反引号里的 /api/... ?a=1&b=2 */
    for (const match of source.matchAll(
      /["`](?<path>\/api\/[^"`?]+)\?(?<query>[^"`]*)["`]/gu,
    )) {
      const path = match.groups?.path;
      const query = match.groups?.query;
      if (path === undefined || query === undefined) continue;
      const names = new Set(
        [...query.matchAll(/(?<name>[a-zA-Z_]+)=/gu)].flatMap(
          (found) => found.groups?.name ?? [],
        ),
      );
      const existing = sent.get(path);
      if (existing === undefined) sent.set(path, names);
      else for (const name of names) existing.add(name);
    }
  }
  return sent;
};

describe("the mobile-to-server query contract", () => {
  it("never sends a parameter the route ignores", () => {
    const ignored: string[] = [];

    for (const [path, names] of parametersSent()) {
      const route = join(webApi, path.slice("/api/".length), "route.ts");
      /*
       * 找不到路由文件本身就是问题：手机端在调一条不存在的接口。
       * 动态段（[id]）那几条路径不带查询参数，走不到这里。
       */
      expect(existsSync(route), `${path} 没有对应的路由文件`).toBe(true);

      const source = readFileSync(route, "utf8");
      for (const name of names) {
        if (!source.includes(`"${name}"`) && !source.includes(`'${name}'`)) {
          ignored.push(`${path} 传了 ?${name}，但它的 route.ts 从不读这个名字`);
        }
      }
    }

    expect(ignored).toEqual([]);
  });
});
