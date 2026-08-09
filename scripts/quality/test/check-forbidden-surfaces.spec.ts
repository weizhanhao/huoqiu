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
      'import { Controller } from "@nestjs/common";\n@Controller("trade")\nexport class ExecutionController {}',
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
      'import { Controller } from "@nestjs/common";\n@Controller("trade")\nexport class Orders {}',
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
    expect(result.stderr).toContain(relativePath);
  });

  it("accepts a CommonJS registry factory with a static parameter default", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      'module.exports = function registry(options = {}) { return { routes: ["/watchlist"] }; };',
      "apps/web/src/navigation/route-registry.cjs",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
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
    "const RouteController = Nest.Controller; @RouteController(resolveRoute()) class Orders {}",
    "const ReadRoute = Nest.Get; class Orders { @ReadRoute(resolveRoute()) list() {} }",
    "const { Post: CreateRoute } = Nest; class Orders { @CreateRoute(resolveRoute()) create() {} }",
  ])(
    "fails closed for a local alias derived from an @nestjs/common namespace %s",
    async (declaration) => {
      const root = await createRepository();
      const relativePath = "apps/api/src/execution/orders.ts";
      await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
      await writeCandidate(
        root,
        `import * as Nest from "@nestjs/common";\n${declaration}`,
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    'const ReadRoute = Nest.Get; class Orders { @ReadRoute("watchlist") list() {} }',
    'const { Post: CreateRoute } = Nest; class Orders { @CreateRoute("watchlist") create() {} }',
  ])(
    "accepts a static route through an @nestjs/common namespace alias %s",
    async (declaration) => {
      const root = await createRepository();
      await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
      await writeCandidate(
        root,
        `import * as Nest from "@nestjs/common";\n${declaration}`,
        "apps/api/src/execution/orders.ts",
      );

      expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
    },
  );

  it("fails closed for a computed Nest namespace decorator with a dynamic route", async () => {
    const root = await createRepository();
    const relativePath = "apps/api/src/execution/orders.ts";
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'import * as Nest from "@nestjs/common";\n@(Nest["Controller"])(resolveRoute()) class Orders {}',
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
    expect(result.stderr).toContain(relativePath);
  });

  it("accepts a computed Nest namespace decorator with a static route", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'import * as Nest from "@nestjs/common";\nclass Orders { @(Nest["Get"])("watchlist") list() {} }',
      "apps/api/src/execution/orders.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("rejects the direct computed Nest decorator spelling as malformed TypeScript", async () => {
    const root = await createRepository();
    const relativePath = "apps/api/src/execution/orders.ts";
    await writeCandidate(
      root,
      'import * as Nest from "@nestjs/common";\n@Nest["Controller"](resolveRoute()) class Orders {}',
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_MALFORMED");
    expect(result.stderr).toContain(relativePath);
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
    "module.exports = resolveRuntimeRegistry();",
    "exports.registry = resolveRuntimeRegistry();",
  ])(
    "requires a CommonJS registry export to satisfy the static schema %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.cjs";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    'module.exports = { routes: ["/watchlist"] };',
    'exports.registry = { routes: ["/watchlist"] };',
  ])(
    "accepts a statically decidable CommonJS registry export %s",
    async (source) => {
      const root = await createRepository();
      await writeCandidate(
        root,
        source,
        "apps/web/src/navigation/route-registry.cjs",
      );

      expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
    },
  );

  it("requires a generic client registry default export to satisfy the static schema", async () => {
    const root = await createRepository();
    const relativePath = "apps/web/src/registry.ts";
    await writeCandidate(
      root,
      "export default resolveRuntimeRegistry();",
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
    expect(result.stderr).toContain(relativePath);
  });

  it("requires a generic API registry default export to satisfy the static schema", async () => {
    const root = await createRepository();
    const relativePath = "apps/api/src/registry.ts";
    await writeCandidate(
      root,
      "export default resolveRuntimeRegistry();",
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
    expect(result.stderr).toContain(relativePath);
  });

  it.each([
    "if (enabled) module.exports = resolveRuntimeRegistry();",
    "Object.assign(module.exports, resolveRuntimeRegistry());",
    'export const registry = { routes: ["/watchlist"] }; registry.routes.push(resolveRuntimeRoute());',
    'export const registry = { routes: ["/watchlist"] }; registry.routes = resolveRuntimeRoutes();',
  ])(
    "rejects unsupported top-level runtime logic in a static registry %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = source.includes("module.exports")
        ? "apps/web/src/navigation/route-registry.cjs"
        : "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it("accepts static top-level constants followed by an explicit export", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      'const routes = ["/watchlist"]; const registry = { routes }; export { registry };',
      "apps/web/src/navigation/route-registry.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

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

  it.each([
    ["apps/web/src/runtime.ts", 'export const command = "trade";'],
    ["apps/mobile/src/runtime.ts", 'export const command = "trade";'],
    ["packages/example/src/runtime.ts", 'export const command = "trade";'],
    ["src/runtime.ts", 'export const command = "trade";'],
    ["runtime.ts", 'export const command = "trade";'],
    ["scripts/runtime.ts", 'export const command = "trade";'],
    ["config/runtime.ts", 'export const command = "trade";'],
  ])("scans every supported runtime source root %s", async (path, source) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(root, source, path);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
    expect(result.stderr).toContain(path);
  });

  it("scans an otherwise excluded build artifact when a package export makes it runtime reachable", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      JSON.stringify({
        name: "@example/runtime",
        exports: {
          ".": { types: "./src/index.ts", import: "./dist/index.js" },
        },
      }),
      "packages/example/package.json",
    );
    await writeCandidate(
      root,
      'export const command = "trade";',
      "packages/example/dist/index.js",
    );
    await writeCandidate(
      root,
      'export const command = "watchlist";',
      "packages/example/src/index.ts",
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("packages/example/dist/index.js");
    expect(result.stderr).toContain("trade");
  });

  it.each([
    "routes.push(resolveRuntimeRoute())",
    "routes.splice(0, 0, resolveRuntimeRoute())",
    'Reflect.set(routes, "0", resolveRuntimeRoute())',
    "Object.assign(routes, { 0: resolveRuntimeRoute() })",
    "const alias = routes; alias.push(resolveRuntimeRoute())",
  ])(
    "rejects a mutation of an imported runtime registry %s",
    async (mutation) => {
      const root = await createRepository();
      await writeCandidate(
        root,
        'export const routes = ["/watchlist"];',
        "packages/example/src/runtime.ts",
      );
      const relativePath = "apps/web/src/bootstrap.ts";
      await writeCandidate(
        root,
        `import { routes } from "../../../packages/example/src/runtime";\n${mutation};`,
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    "export function registry(options = resolveRuntimeRegistry()) { return { routes: ['/watchlist'] }; }",
    "export function registry({ routes = resolveRuntimeRoutes() } = {}) { return { routes: ['/watchlist'] }; }",
    "module.exports = function registry(options = resolveRuntimeRegistry()) { return { routes: ['/watchlist'] }; };",
  ])(
    "rejects a dynamic registry function parameter initializer %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = source.startsWith("module")
        ? "apps/web/src/navigation/route-registry.cjs"
        : "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    "registry.routes.splice(0, 0, resolveRuntimeRoute());",
    'Reflect.set(registry.routes, "0", resolveRuntimeRoute());',
  ])("rejects registry mutation inside a factory %s", async (mutation) => {
    const root = await createRepository();
    const relativePath = "apps/web/src/navigation/route-registry.ts";
    await writeCandidate(
      root,
      `export function registry() { const registry = { routes: ["/watchlist"] }; ${mutation} return registry; }`,
      relativePath,
    );

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
    expect(result.stderr).toContain(relativePath);
  });

  it.each([
    'const key = "Controller"; const { [key]: RouteController } = Nest; @RouteController(resolveRoute()) class Orders {}',
    'const { ["Get"]: ReadRoute } = Nest; class Orders { @ReadRoute(resolveRoute()) list() {} }',
    "const { [resolveDecoratorName()]: ReadRoute } = Nest; class Orders { @ReadRoute(resolveRoute()) list() {} }",
  ])(
    "tracks a computed Nest namespace destructuring alias %s",
    async (declaration) => {
      const root = await createRepository();
      await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
      const relativePath = "apps/api/src/execution/orders.ts";
      await writeCandidate(
        root,
        `import * as Nest from "@nestjs/common";\n${declaration}`,
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it.each([
    'const Nest = require("@nestjs/common"); const RouteController = Nest.Controller; @RouteController(resolveRoute()) class Orders {}',
    'const { Get: ReadRoute } = require("@nestjs/common"); class Orders { @ReadRoute(resolveRoute()) list() {} }',
    'const { ["Post"]: CreateRoute } = require("@nestjs/common"); class Orders { @CreateRoute(resolveRoute()) create() {} }',
  ])("tracks a CommonJS Nest alias %s", async (declaration) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const relativePath = "apps/api/src/execution/orders.cts";
    await writeCandidate(root, declaration, relativePath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
    expect(result.stderr).toContain(relativePath);
  });

  it("accepts static routes through CommonJS and computed Nest aliases", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'const Nest = require("@nestjs/common"); const { ["Get"]: ReadRoute } = Nest; class Orders { @ReadRoute("watchlist") list() {} }',
      "apps/api/src/execution/orders.cts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it.each([
    ["payment", "payment"],
    ["payment_checkout", "payment"],
    ["payment_intent", "payment"],
    ["account_eligibility", "account-eligibility"],
    ["investor_suitability", "account-eligibility"],
    ["brokerage_data_import", "unauthorized-data-import"],
    ["data_import", "unauthorized-data-import"],
    ["portfolio_sync", "unauthorized-data-import"],
    ["paid_advice", "paid-advice"],
    ["premium_stock_recommendation", "paid-advice"],
    ["place_order", "execution"],
    ["brokerage_connection", "execution"],
    ["trading", "execution"],
    ["支付", "payment"],
    ["开户资格", "account-eligibility"],
    ["数据导入", "unauthorized-data-import"],
    ["付费荐股", "paid-advice"],
    ["交易下单", "execution"],
  ])(
    "rejects licensed or unauthorized surface synonym %s",
    async (surface, category) => {
      const root = await createRepository();
      await writeCandidate(root, JSON.stringify({ command: surface }));

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(category);
    },
  );

  it.each([
    "paymentHistoryLabel",
    "tradingHoursLabel",
    "eligibleDisplayRows",
    "importantData",
    "importMap",
    "adviceColumn",
    "orderingPreference",
    "brokerageFirmNews",
  ])("does not reject a mere licensed-surface substring %s", async (value) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ label: value }));

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts ordinary array push usage in runtime source", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'const values: string[] = []; values.push("watchlist"); const paths: string[] = []; paths.push("asset"); export { values, paths };',
      "apps/api/src/health/values.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts validation issue paths outside route and registry sources", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'export const validate = (index: number) => ({ code: "custom", path: ["rows", index, "value"] });',
      "packages/contracts/src/d0/schema.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts ordinary exported card schemas outside a registry module", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      "const cardIdSchema = createSchema(); export const feedCardSchema = object({ card_id: cardIdSchema });",
      "packages/contracts/src/feed/card-v1.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("parses a clean CommonJS TypeScript .cts runtime source", async () => {
    const root = await createRepository();
    await writeCandidate(
      root,
      'exports.registry = { routes: ["/watchlist"] };',
      "apps/web/src/navigation/route-registry.cts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it.each([
    'export const registry = { routes: ["/tr" + "ade"] };',
    'const key = ["ro", "utes"].join(""); const value = ["/tr", "ade"].join(""); export default { [key]: [value] };',
  ])(
    "rejects a forbidden surface assembled inside a static registry %s",
    async (source) => {
      const root = await createRepository();
      const relativePath = "apps/web/src/navigation/route-registry.ts";
      await writeCandidate(root, source, relativePath);

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
      expect(result.stderr).toContain(relativePath);
      expect(result.stderr).toContain("trade");
    },
  );

  it.each([
    ["基金申购", "subscription", "product-command"],
    ["开户", "open_account", "account-command"],
    ["资金托管", "fund_custody", "custody"],
    ["跟单", "copy_portfolio", "portfolio-copying"],
    ["自动交易", "real_trade", "execution"],
    ["打赏", "payment", "payment"],
    ["基 金 申 购", "subscription", "product-command"],
  ])(
    "rejects Chinese compliance denylist surface %s",
    async (surface, normalizedSurface, category) => {
      const root = await createRepository();
      await writeCandidate(root, JSON.stringify({ routes: [surface] }));

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
      expect(result.stderr).toContain(normalizedSurface);
      expect(result.stderr).toContain(category);
    },
  );

  it.each([
    { scheme: "trade" },
    {
      android: {
        intentFilters: [
          {
            action: "VIEW",
            data: [{ scheme: "trade" }],
            category: ["BROWSABLE"],
          },
        ],
      },
    },
  ])("scans Expo app.json runtime configuration %#", async (expo) => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    const relativePath = "apps/mobile/app.json";
    await writeCandidate(root, JSON.stringify({ expo }), relativePath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
    expect(result.stderr).toContain(relativePath);
    expect(result.stderr).toContain("trade");
  });

  it("scans a package runtime entry without a dot-slash prefix", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      JSON.stringify({ name: "@example/runtime", main: "dist/index.js" }),
      "packages/example/package.json",
    );
    const relativePath = "packages/example/dist/index.js";
    await writeCandidate(root, 'export const command = "trade";', relativePath);

    const result = await runScanner(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FORBIDDEN_RUNTIME_SURFACE");
    expect(result.stderr).toContain(relativePath);
  });

  it.each([
    "let alias; alias = routes; alias.push(resolveRuntimeRoute());",
    "function mutate(value: string[]) { value.push(resolveRuntimeRoute()); } mutate(routes);",
    'Object.defineProperty(routes, "0", { value: resolveRuntimeRoute() });',
    "new Set([routes]);",
    'new Map([["routes", routes]]);',
  ])(
    "rejects an imported registry escaping through an indirect mutation %s",
    async (mutation) => {
      const root = await createRepository();
      await writeCandidate(
        root,
        'export const routes = ["/watchlist"];',
        "packages/example/src/runtime.ts",
      );
      const relativePath = "apps/web/src/bootstrap.ts";
      await writeCandidate(
        root,
        `import { routes } from "../../../packages/example/src/runtime";\n${mutation}`,
        relativePath,
      );

      const result = await runScanner(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("RUNTIME_CANDIDATE_UNRESOLVED");
      expect(result.stderr).toContain(relativePath);
    },
  );

  it("accepts an unrelated local decorator named Get", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      "const Get = (value: unknown) => (_target: unknown, _name: string) => value; class Example { @Get(resolveValue()) method() {} }",
      "apps/api/src/example/service.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts an ordinary exported history helper", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      "export function pushToHistory(value: string) { return value; }",
      "apps/web/src/history.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts a dynamic Zod issue path in an ordinary contract schema", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'import { z } from "zod"; export const feedCardV1Schema = z.object({ type: z.literal("post") });',
      "packages/contracts/src/feed/card-v1.ts",
    );
    await writeCandidate(
      root,
      'import { z } from "zod"; import { feedCardV1Schema } from "@huoqiu/contracts/feed/card-v1"; export const fixtureSchema = z.array(feedCardV1Schema).superRefine((rows, context) => { for (const [index] of rows.entries()) context.addIssue({ code: "custom", path: ["rows", index], message: "invalid row" }); });',
      "packages/contracts/src/d0/schema.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("accepts an ordinary exported feed card schema", async () => {
    const root = await createRepository();
    await writeCandidate(root, JSON.stringify({ routes: ["/watchlist"] }));
    await writeCandidate(
      root,
      'import { z } from "zod"; export const feedCardV1Schema = z.object({ type: z.enum(["post", "news", "market_strip", "topic", "ops_banner"]), schema_version: z.literal(1), card_id: z.string(), published_at: z.string(), source: z.string(), payload: z.record(z.string(), z.unknown()) }).strict();',
      "packages/contracts/src/feed/card-v1.ts",
    );

    expect(await runScanner(root)).toMatchObject({ code: 0, stderr: "" });
  });
});
