import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 每个浏览器 spec 都自己 spawn 一个 Vite dev server，端口写死在文件里。
 * 两个 spec 用同一个端口时，vitest 的并行会让它们互相踢掉：全量运行轮流
 * 失败、单独运行都通过，看起来像随机不稳定，实际是确定性的资源冲突。
 *
 * 真正危险的是它未必表现为失败——抢输的一方可能连上对方的服务器，对着
 * 另一个套件的应用跑完断言然后报绿。fund-center 与 etf-center 就同占过
 * 3417。所以这里把「端口互不相同」直接变成一条断言。
 */
const testsRoot = fileURLToPath(new URL("./", import.meta.url));

const collectBrowserSpecs = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) return collectBrowserSpecs(`${path}/`);
      return entry.name.endsWith(".browser.spec.ts") ? [path] : [];
    }),
  );
  return nested.flat();
};

describe("browser spec dev-server ports", () => {
  it("gives every browser spec its own port", async () => {
    const specs = await collectBrowserSpecs(testsRoot);
    // 扫不到文件说明匹配规则失效了，此时「没有冲突」是假的安心。
    expect(specs.length).toBeGreaterThan(1);

    const owners = new Map<number, string>();
    const collisions: string[] = [];

    for (const spec of specs) {
      const source = await readFile(spec, "utf8");
      const match = /^const port = (\d+);$/mu.exec(source);
      // 取不到端口等于这条 spec 没被守卫覆盖，必须报出来而不是跳过。
      expect(match, `${spec} 未声明 const port`).not.toBeNull();

      const port = Number(match?.[1]);
      const owner = owners.get(port);
      if (owner === undefined) {
        owners.set(port, spec);
      } else {
        collisions.push(`${port}: ${owner} 与 ${spec}`);
      }
    }

    expect(collisions).toEqual([]);
  });
});
