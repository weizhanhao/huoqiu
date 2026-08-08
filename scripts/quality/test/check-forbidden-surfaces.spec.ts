import { execFile as execFileCallback } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { scanForbiddenSurfaces } from "../check-forbidden-surfaces.mts";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const scannerPath = resolve(
  repositoryRoot,
  "scripts/quality/check-forbidden-surfaces.mts",
);
const tsxCliPath = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const temporaryRoots: string[] = [];

interface ScannerResult {
  code: number;
  stderr: string;
  stdout: string;
}

const createRepository = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "huoqiu-surfaces-"));
  temporaryRoots.push(root);
  return root;
};

const writeCandidate = async (
  root: string,
  content: string,
  path = "apps/web/src/navigation/route-registry.json",
): Promise<string> => {
  const absolutePath = resolve(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
};

const runScanner = async (root: string): Promise<ScannerResult> => {
  try {
    const result = await execFile(process.execPath, [tsxCliPath, scannerPath], {
      cwd: root,
    });
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const failure = error as Error & {
      code?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : -1,
      stderr: failure.stderr ?? failure.message,
      stdout: failure.stdout ?? "",
    };
  }
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(async (root) => await rm(root, { recursive: true })),
  );
});

describe("forbidden runtime surfaces", () => {
  it("accepts a clean runtime registry", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      JSON.stringify({
        routes: ["/watchlist", "/market/quotes"],
        channels: ["in_app"],
        card_types: ["market_quote", "watchlist_item"],
      }),
    );

    const result = await runScanner(root);

    expect(result).toMatchObject({ code: 0, stderr: "" });
  });

  it.each([
    ["/trade", "trade", "execution"],
    ["private_fund", "private_fund", "financial-product"],
    ["public_portfolio", "public_portfolio", "portfolio-privacy"],
    ["apns", "apns", "notification-transport"],
    [
      "personalized_target_price",
      "personalized_target_price",
      "personalized-guidance",
    ],
  ])(
    "independently rejects required registry token %s",
    async (token, normalizedSurface, category) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.json";
      await writeCandidate(
        root,
        JSON.stringify({ routes: [token] }),
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(relativePath);
      expect(result.stderr).toContain(normalizedSurface);
      expect(result.stderr).toContain(category);
    },
  );

  it.each([
    "privateFund",
    "private-fund",
    "private_fund",
    "/private/fund",
    "publicPortfolio",
    "public-portfolio",
    "public_portfolio",
    "/public/portfolio",
    "personalizedTargetPrice",
    "personalized-target-price",
    "personalized_target_price",
    "/personalized/target/price",
  ])("rejects camel, kebab, snake and path spelling %s", async (surface) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ route: surface }));

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
  });

  it.each([
    ["push", "notification-capability"],
    ["aiAdvice", "automated-advice"],
    ["target-price", "target-price"],
    ["copy_portfolio", "portfolio-copying"],
    ["realTrade", "execution"],
    ["open-account", "account-command"],
    ["subscription", "product-command"],
    ["redemption", "product-command"],
    ["personalizedBuy", "personalized-guidance"],
    ["personalized-sell", "personalized-guidance"],
    ["personalized_position", "personalized-guidance"],
  ])("rejects platform-design boundary %s", async (surface, category) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ command: surface }));

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(category);
  });

  it("scans normalized runtime paths as well as content", async () => {
    const root = await createRepository();
    const relativePath = "apps/web/src/app/trade/page.tsx";
    await writeCandidate(
      root,
      "export default function Page() { return null; }",
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(relativePath);
    expect(result.stderr).toContain("trade");
  });

  it.each([
    [
      "apps/mobile/app/trade.tsx",
      "export default function Trade() { return null; }",
    ],
    [
      "apps/api/src/trading/execution.controller.ts",
      '@Controller("trade")\nexport class ExecutionController {}',
    ],
    [
      "packages/domain/src/capabilities/registry.ts",
      'export const capability = "fundSubscribe";',
    ],
  ])("covers runtime surface %s", async (relativePath, source) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(root, source, relativePath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(relativePath);
  });

  it.each(["apps/web/pages/trade.tsx", "apps/web/src/pages/private-fund.tsx"])(
    "covers a Next Pages Router runtime route %s",
    async (relativePath) => {
      const root = await createRepository();
      await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
      await writeCandidate(
        root,
        "export default function Page() { return null; }",
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it("discovers a Nest decorator route independently of its path", async () => {
    const root = await createRepository();
    const relativePath = "apps/api/src/execution/orders.ts";
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      '@Controller("trade")\nexport class Orders {}',
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
    expect(result.stderr).toContain(relativePath);
  });

  it.each([
    [
      "Controller",
      "RouteController",
      "@RouteController(resolveRoute())\nclass Orders {}",
    ],
    [
      "Get",
      "ReadRoute",
      "class Orders { @ReadRoute(resolveRoute()) list() {} }",
    ],
    [
      "Post",
      "CreateRoute",
      "class Orders { @CreateRoute(resolveRoute()) create() {} }",
    ],
  ])(
    "fails closed for an aliased @nestjs/common %s decorator with a dynamic route",
    async (imported, local, declaration) => {
      const root = await createRepository();
      const relativePath = "apps/api/src/execution/orders.ts";
      await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
      await writeCandidate(
        root,
        `import { ${imported} as ${local} } from "@nestjs/common";\n${declaration}`,
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it("accepts an aliased Nest decorator with a static clean route", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'import { Get as ReadRoute } from "@nestjs/common";\nclass Orders { @ReadRoute("watchlist") list() {} }',
      "apps/api/src/execution/orders.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it.each([
    ['export const route = "/tr\\u0061de";', "trade"],
    ['export const route = "/tr" + "ade";', "trade"],
    ['export const route = `/tr${"ade"}`;', "trade"],
    ['export const route = ["/tr", "ade"].join("");', "trade"],
  ])(
    "extracts statically decidable TypeScript surface %s",
    async (source, surface) => {
      const root = await createRepository();
      await writeCandidate(
        root,
        source,
        "apps/web/src/navigation/route-registry.ts",
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(surface);
    },
  );

  it.each([
    "export const route = resolveRuntimeRoute();",
    'export const routes = ["/watchlist", resolveRuntimeRoute()];',
  ])(
    "fails closed on a runtime registry expression that is not statically decidable %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    "export default resolveRuntimeRegistry();",
    "export const registry = resolveRuntimeRegistry();",
    'export const registry = { ["routes"]: resolveRuntimeRoutes() };',
    "export function registry() { return resolveRuntimeRoutes(); }",
    "const registry = resolveRuntimeRegistry(); export { registry };",
  ])(
    "requires every top-level runtime registry export to satisfy the static schema %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    "const registry = resolveRuntimeRegistry(); function shadow() { const registry = []; } export { registry };",
    "const runtime = resolveRuntimeRegistry(); function shadow() { const runtime = []; } export { runtime as registry };",
    "const runtime = resolveRuntimeRegistry(); function shadow() { const runtime = []; } export { runtime as default };",
  ])(
    "resolves an exported registry alias from its top-level lexical binding %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    'export const registry = { routes: ["/watchlist"] };',
    'export function registry() { return { routes: ["/watchlist"] }; }',
    'const registry = { routes: ["/watchlist"] }; export { registry as routeRegistry };',
    'const registry = { routes: ["/watchlist"] }; export { registry as default };',
  ])(
    "accepts a statically decidable top-level registry export %s",
    async (source) => {
      const root = await createRepository();
      await writeCandidate(
        root,
        source,
        "apps/web/src/navigation/route-registry.ts",
      );

      expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
    },
  );

  it.each([
    [JSON.stringify({ route: "/portfolio/public" }), "public_portfolio"],
    [JSON.stringify({ command: "fundSubscribe" }), "subscription"],
    [JSON.stringify({ command: "redeemFund" }), "redemption"],
  ])("rejects semantic product surface %s", async (content, surface) => {
    const root = await createRepository();
    await writeCandidate(root, content);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(surface);
  });

  it("does not treat comments as runtime surfaces", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      "// real trade is intentionally absent\nexport const routes = ['/watchlist'];",
      "apps/web/src/navigation/route-registry.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("does not let a runtime docs segment hide a route", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const relativePath = "apps/web/src/app/docs/trade/page.tsx";
    await writeCandidate(
      root,
      "export default function Page() { return null; }",
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(relativePath);
  });

  it("does not reject mere substrings", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      JSON.stringify({
        routes: ["/trademark", "/tradeoff", "/pushpin"],
        fields: [
          "privateFunding",
          "publicityPortfolio",
          "apnStatus",
          "targetPricing",
          "advisor",
          "positioned",
          "buyerProfile",
          "sellerProfile",
        ],
      }),
    );

    const result = await runScanner(root);

    expect(result).toMatchObject({ code: 0, stderr: "" });
  });

  it("excludes docs, tests, negative fixtures and build output", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    for (const path of [
      "apps/web/docs/navigation/route-registry.json",
      "apps/web/tests/navigation/route-registry.json",
      "apps/web/fixtures/negative/route-registry.json",
      "apps/web/dist/navigation/route-registry.json",
      "apps/web/.next/navigation/route-registry.json",
      "packages/domain/coverage/navigation/route-registry.json",
    ]) {
      await writeCandidate(root, JSON.stringify({ routes: ["/trade"] }), path);
    }

    const result = await runScanner(root);

    expect(result).toMatchObject({ code: 0, stderr: "" });
  });

  it("scans explicitly positive runtime fixtures", async () => {
    const root = await createRepository();
    const relativePath = "packages/contracts/fixtures/positive/navigation.json";
    await writeCandidate(
      root,
      JSON.stringify({ deep_link: "/trade" }),
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(relativePath);
  });

  it("fails closed when there are no runtime candidates", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      JSON.stringify({ routes: ["/trade"] }),
      "apps/web/tests/route-registry.json",
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATES_MISSING");
  });

  it("fails closed on an unknown structured candidate", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      'route = "/watchlist"',
      "apps/web/src/navigation/route-registry.toml",
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNSUPPORTED");
  });

  it("fails closed on malformed JSON", async () => {
    const root = await createRepository();
    await writeCandidate(root, '{"routes":["/watchlist",]}');

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_MALFORMED");
  });

  it.each([
    ['{"route":"/watchlist","route":"/market"}', "JSON"],
    ["routes:\n  clean: /watchlist\n malformed: value", "YAML"],
    ["route: /watchlist\nroute: /market", "YAML"],
  ])("fails closed on malformed or duplicate %s", async (content) => {
    const root = await createRepository();
    const extension = content.startsWith("{") ? "json" : "yaml";
    await writeCandidate(
      root,
      content,
      `apps/web/src/navigation/route-registry.${extension}`,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_MALFORMED");
  });

  it("fails closed on malformed TypeScript", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      "export const routes = [;",
      "apps/web/src/navigation/route-registry.ts",
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_MALFORMED");
  });

  it("fails closed on an unreadable runtime candidate", async () => {
    const root = await createRepository();
    const path = await writeCandidate(
      root,
      JSON.stringify({ routes: ["/watchlist"] }),
    );
    await chmod(path, 0);

    try {
      const result = await runScanner(root);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNREADABLE");
    } finally {
      await chmod(path, 0o600);
    }
  });

  it("fails closed on a candidate symlink that leaves the repository", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(
      resolve(tmpdir(), "huoqiu-surfaces-outside-"),
    );
    temporaryRoots.push(outside);
    const outsidePath = resolve(outside, "route-registry.json");
    await writeFile(
      outsidePath,
      JSON.stringify({ routes: ["/watchlist"] }),
      "utf8",
    );
    const linkPath = resolve(
      root,
      "apps/web/src/navigation/route-registry.json",
    );
    await mkdir(dirname(linkPath), { recursive: true });
    await symlink(outsidePath, linkPath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_SYMLINK");
  });

  it("fails closed on a non-candidate symlink inside an approved source root", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const outside = await mkdtemp(
      resolve(tmpdir(), "huoqiu-surfaces-outside-"),
    );
    temporaryRoots.push(outside);
    const linkPath = resolve(root, "apps/web/src/shared.link");
    await mkdir(dirname(linkPath), { recursive: true });
    await symlink(outside, linkPath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_SYMLINK");
  });

  it("checks a symlink before applying an anchored docs exclusion", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const outside = await mkdtemp(
      resolve(tmpdir(), "huoqiu-surfaces-outside-"),
    );
    temporaryRoots.push(outside);
    const linkPath = resolve(root, "apps/web/docs");
    await mkdir(dirname(linkPath), { recursive: true });
    await symlink(outside, linkPath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_SYMLINK");
  });

  it("fails closed on lexical repository-root traversal", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const canonicalRoot = await realpath(root);

    await expect(
      scanForbiddenSurfaces(`${canonicalRoot}/apps/..`),
    ).rejects.toThrow("RUNTIME_CANDIDATE_TRAVERSAL");
  });
});
