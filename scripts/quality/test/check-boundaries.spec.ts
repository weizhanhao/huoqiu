import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const checkerPath = resolve(
  repositoryRoot,
  "scripts/quality/check-boundaries.mts",
);
const tsxCliPath = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const temporaryRoots: string[] = [];

interface CheckerResult {
  code: number;
  stderr: string;
}

const exactWorkspacePolicy = `packages:
  - apps/*
  - packages/*
  - spikes/auth

minimumReleaseAge: 1440
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
trustLockfile: false
blockExoticSubdeps: true

allowBuilds:
  esbuild: true
`;

const writeText = async (
  root: string,
  path: string,
  content: string,
): Promise<void> => {
  const absolutePath = resolve(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
};

const writeJson = async (
  root: string,
  path: string,
  value: unknown,
): Promise<void> =>
  await writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);

const workspacePackage = (
  name: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
): Record<string, unknown> => ({
  name,
  version: "0.0.0",
  private: true,
  type: "module",
  dependencies,
  devDependencies,
});

const createRepository = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "huoqiu-boundaries-"));
  temporaryRoots.push(root);
  await writeText(root, "pnpm-workspace.yaml", exactWorkspacePolicy);
  await writeJson(
    root,
    "apps/web/package.json",
    workspacePackage(
      "@huoqiu/web",
      { "@huoqiu/ui": "workspace:*", react: "19.2.3" },
      { "@huoqiu/config": "workspace:*" },
    ),
  );
  await writeJson(
    root,
    "apps/admin/package.json",
    workspacePackage("@huoqiu/admin", { react: "19.2.3" }),
  );
  await writeJson(
    root,
    "apps/mobile/package.json",
    workspacePackage("@huoqiu/mobile", {
      "react-native-gesture-handler": "2.32.0",
    }),
  );
  await writeJson(root, "packages/ui/package.json", {
    ...workspacePackage(
      "@huoqiu/ui",
      {},
      { "@huoqiu/config": "workspace:*", typescript: "6.0.3" },
    ),
    exports: { "./button": "./src/button.ts" },
  });
  await writeJson(
    root,
    "packages/config/package.json",
    workspacePackage("@huoqiu/config", { typescript: "6.0.3" }),
  );
  await writeJson(
    root,
    "spikes/auth/package.json",
    workspacePackage("@huoqiu/auth-spike", { typescript: "6.0.3" }),
  );
  await writeText(
    root,
    "apps/web/src/index.ts",
    'export { Button } from "@huoqiu/ui/button";\n',
  );
  await writeText(
    root,
    "packages/ui/src/button.ts",
    "export const Button = 1;\n",
  );
  await writeText(
    root,
    "pnpm-lock.yaml",
    `lockfileVersion: "9.0"

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  apps/mobile:
    dependencies:
      react-native-gesture-handler:
        specifier: 2.32.0
        version: 2.32.0
`,
  );
  return root;
};

const readManifest = async (
  root: string,
  path: string,
): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<
    string,
    unknown
  >;

const runChecker = async (root: string): Promise<CheckerResult> => {
  try {
    const result = await execFile(
      process.execPath,
      [tsxCliPath, checkerPath, "--scope", "workspace"],
      { cwd: root },
    );
    return { code: 0, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : -1,
      stderr: failure.stderr ?? failure.message,
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

describe("workspace and supply-chain boundaries", () => {
  it("accepts the exact workspace graph and pnpm policy", async () => {
    const root = await createRepository();

    const result = await runChecker(root);

    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it("rejects a package depending on an app", async () => {
    const root = await createRepository();
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>)["@huoqiu/web"] =
      "workspace:*";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PACKAGE_DEPENDS_ON_APP");
  });

  it("rejects an app depending on a sibling app", async () => {
    const root = await createRepository();
    const path = "apps/web/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>)["@huoqiu/admin"] =
      "workspace:*";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("APP_DEPENDS_ON_SIBLING_APP");
  });

  it("rejects an undeclared @huoqiu source import", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/src/index.ts",
      'import("@huoqiu/ui/client");\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
    expect(result.stderr).toContain("apps/admin/src/index.ts");
  });

  it("resolves a workspace package export before rejecting a docs trampoline", async () => {
    const root = await createRepository();
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    manifest.exports = { "./button": "./docs/trampoline.ts" };
    await writeJson(root, path, manifest);
    await writeText(
      root,
      "packages/ui/docs/trampoline.ts",
      "export const Button = 1;\n",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
    expect(result.stderr).toContain("packages/ui/docs/trampoline.ts");
  });

  it("rejects a workspace export that traverses a nested docs symlink", async () => {
    const root = await createRepository();
    const outsideRoot = await mkdtemp(resolve(tmpdir(), "huoqiu-export-"));
    temporaryRoots.push(outsideRoot);
    await writeText(outsideRoot, "secret.ts", "export const Button = 1;\n");
    await mkdir(resolve(root, "packages/ui/docs"), { recursive: true });
    await symlink(outsideRoot, resolve(root, "packages/ui/docs/escape"), "dir");
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    manifest.exports = { "./button": "./docs/escape/secret.ts" };
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_SYMLINK_FORBIDDEN");
    expect(result.stderr).toContain("packages/ui/docs/escape");
  });

  it("rejects a workspace import whose tsconfig path resolves outside the repository", async () => {
    const root = await createRepository();
    const outsideRoot = await mkdtemp(resolve(tmpdir(), "huoqiu-paths-"));
    temporaryRoots.push(outsideRoot);
    await writeText(outsideRoot, "button.ts", "export const Button = 1;\n");
    await writeJson(root, "apps/web/tsconfig.json", {
      compilerOptions: {
        baseUrl: ".",
        paths: { "@huoqiu/ui/*": [`${outsideRoot}/*`] },
      },
    });

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_PATH_TRAVERSAL");
  });

  it("rejects a workspace import whose tsconfig path resolves to a sibling app", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/src/button.ts",
      "export const Button = 1;\n",
    );
    await writeJson(root, "apps/web/tsconfig.json", {
      compilerOptions: {
        baseUrl: ".",
        paths: { "@huoqiu/ui/*": ["../admin/src/*"] },
      },
    });

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("APP_DEPENDS_ON_SIBLING_APP");
  });

  it("rejects a workspace package export through a fixtures trampoline", async () => {
    const root = await createRepository();
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    manifest.exports = { "./button": "./fixtures/trampoline.ts" };
    await writeJson(root, path, manifest);
    await writeText(
      root,
      "packages/ui/fixtures/trampoline.ts",
      "export const Button = 1;\n",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
    expect(result.stderr).toContain("packages/ui/fixtures/trampoline.ts");
  });

  it("fails closed when a declared workspace import cannot be resolved", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/web/src/missing.ts",
      'import "@huoqiu/ui/missing";\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_UNRESOLVED");
    expect(result.stderr).toContain("@huoqiu/ui/missing");
  });

  it("checks every conditional runtime export even when TypeScript resolves a safe path", async () => {
    const root = await createRepository();
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    manifest.exports = {
      "./button": {
        types: "./src/button.ts",
        import: "./docs/runtime-button.ts",
      },
    };
    await writeJson(root, path, manifest);
    await writeText(
      root,
      "packages/ui/docs/runtime-button.ts",
      "export const Button = 1;\n",
    );
    await writeJson(root, "apps/web/tsconfig.json", {
      compilerOptions: {
        baseUrl: ".",
        paths: { "@huoqiu/ui/*": ["../../packages/ui/src/*"] },
      },
    });

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
    expect(result.stderr).toContain("packages/ui/docs/runtime-button.ts");
  });

  it("uses the most specific matching package export pattern", async () => {
    const root = await createRepository();
    const path = "packages/ui/package.json";
    const manifest = await readManifest(root, path);
    manifest.exports = {
      "./*": "./src/*.ts",
      "./button*": "./docs/button*.ts",
    };
    await writeJson(root, path, manifest);
    await writeText(
      root,
      "packages/ui/docs/button.ts",
      "export const Button = 1;\n",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
    expect(result.stderr).toContain("packages/ui/docs/button.ts");
  });

  it("rejects a package importing an app through a relative path", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/web/src/secret.ts",
      "export const secret = 1;\n",
    );
    await writeText(
      root,
      "packages/ui/src/cross-boundary.ts",
      'import { secret } from "../../../apps/web/src/secret";\nvoid secret;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PACKAGE_DEPENDS_ON_APP");
  });

  it("rejects a production import through an excluded same-project test trampoline", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/web/tests/trampoline.ts",
      "export const trampoline = 1;\n",
    );
    await writeText(
      root,
      "apps/web/src/use-trampoline.ts",
      'import { trampoline } from "../tests/trampoline";\nvoid trampoline;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });

  it("rejects a production import through an excluded declared-workspace docs trampoline", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "packages/ui/docs/trampoline.ts",
      "export const trampoline = 1;\n",
    );
    await writeText(
      root,
      "apps/web/src/use-trampoline.ts",
      'import { trampoline } from "../../../packages/ui/docs/trampoline";\nvoid trampoline;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });

  it("rejects a relative import that leaves a project without a workspace owner", async () => {
    const root = await createRepository();
    await writeText(root, "shared/trampoline.ts", "export const value = 1;\n");
    await writeText(
      root,
      "apps/web/src/unmapped.ts",
      'import { value } from "../../../shared/trampoline";\nvoid value;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_RELATIVE_IMPORT_UNMAPPED");
  });

  it("rejects a relative import that escapes the repository root", async () => {
    const root = await createRepository();
    const outsideRoot = await mkdtemp(resolve(tmpdir(), "huoqiu-outside-"));
    temporaryRoots.push(outsideRoot);
    await writeText(outsideRoot, "secret.ts", "export const secret = 1;\n");
    const escapeSpecifier = relative(
      resolve(root, "apps/web/src"),
      resolve(outsideRoot, "secret"),
    )
      .split("\\")
      .join("/");
    await writeText(
      root,
      "apps/web/src/escape.ts",
      `import { secret } from ${JSON.stringify(escapeSpecifier)};\nvoid secret;\n`,
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_PATH_TRAVERSAL");
  });

  it("rejects an excluded symlink trampoline before skipping its directory", async () => {
    const root = await createRepository();
    const outsideRoot = await mkdtemp(resolve(tmpdir(), "huoqiu-symlink-"));
    temporaryRoots.push(outsideRoot);
    await writeText(outsideRoot, "secret.ts", "export const secret = 1;\n");
    await symlink(outsideRoot, resolve(root, "packages/ui/docs"), "dir");
    await writeText(
      root,
      "apps/web/src/symlink.ts",
      'import { secret } from "../../../packages/ui/docs/secret";\nvoid secret;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_SYMLINK_FORBIDDEN");
  });

  it("allows a declared cross-workspace relative production import", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "packages/ui/src/button.ts",
      "export const button = 1;\n",
    );
    await writeText(
      root,
      "apps/web/src/relative-ui.ts",
      'import { button } from "../../../packages/ui/src/button";\nvoid button;\n',
    );

    expect(await runChecker(root)).toEqual({ code: 0, stderr: "" });
  });

  it("allows a framework declaration to import its generated type output", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/web/.next/types/routes.d.ts",
      "export type Route = string;\n",
    );
    await writeText(
      root,
      "apps/web/next-env.d.ts",
      'import "./.next/types/routes.d.ts";\n',
    );

    expect(await runChecker(root)).toEqual({ code: 0, stderr: "" });
  });

  it("resolves tsconfig aliases to their real workspace owner", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "packages/ui/src/button.ts",
      "export const button = 1;\n",
    );
    await writeJson(root, "apps/admin/tsconfig.json", {
      compilerOptions: {
        baseUrl: ".",
        paths: { "@ui/*": ["../../packages/ui/src/*"] },
      },
    });
    await writeText(
      root,
      "apps/admin/src/alias.ts",
      'import { button } from "@ui/button";\nvoid button;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
  });

  it("fails closed on a non-literal dynamic import", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/src/dynamic.ts",
      "const target = process.env.MODULE_NAME;\nvoid import(target);\n",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_DYNAMIC_IMPORT_UNRESOLVED");
  });

  it("evaluates a constant dynamic import before checking ownership", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/src/dynamic.ts",
      'const target = "@huoqiu/" + "ui";\nvoid import(target);\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
  });

  it("checks project-root runtime configuration files", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/next.config.ts",
      'import { Button } from "@huoqiu/ui/button";\nvoid Button;\nexport default {};\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
    expect(result.stderr).toContain("apps/admin/next.config.ts");
  });

  it("rejects an import of an unknown @huoqiu package even when declared", async () => {
    const root = await createRepository();
    const path = "apps/web/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>)["@huoqiu/ghost"] =
      "workspace:*";
    await writeJson(root, path, manifest);
    await writeText(root, "apps/web/src/ghost.ts", 'import "@huoqiu/ghost";\n');

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNKNOWN_WORKSPACE_DEPENDENCY");
  });

  it("rejects duplicate workspace package names", async () => {
    const root = await createRepository();
    await writeJson(
      root,
      "packages/duplicate/package.json",
      workspacePackage("@huoqiu/ui"),
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("DUPLICATE_WORKSPACE_NAME");
  });

  it.each(["^19.2.3", "~19.2.3", "*", "latest", "next"])(
    "rejects non-exact external direct range %s",
    async (version) => {
      const root = await createRepository();
      const path = "apps/admin/package.json";
      const manifest = await readManifest(root, path);
      (manifest.dependencies as Record<string, string>).react = version;
      await writeJson(root, path, manifest);

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("DIRECT_DEPENDENCY_NOT_EXACT");
    },
  );

  it("accepts an npm alias only when its target is exactly pinned", async () => {
    const root = await createRepository();
    const path = "packages/config/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>).zod4 = "npm:zod@4.4.3";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    "npm:zod@^4.4.3",
    "npm:zod@~4.4.3",
    "npm:zod@latest",
    "npm:zod",
    "npm:file:../zod@4.4.3",
    "npm:@scope/pkg@^1.2.3",
  ])("rejects a non-exact or malformed npm alias %s", async (version) => {
    const root = await createRepository();
    const path = "packages/config/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>).zod4 = version;
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("DIRECT_DEPENDENCY_NOT_EXACT");
  });

  it.each([
    "git+ssh://git@example.invalid/repo.git#deadbeef",
    "git+https://example.invalid/repo.git#deadbeef",
    "https://example.invalid/archive.tgz",
    "http://example.invalid/archive.tgz",
    "file:../local",
    "link:../local",
  ])("rejects unapproved dependency source %s", async (version) => {
    const root = await createRepository();
    const path = "apps/admin/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>).react = version;
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("DEPENDENCY_SOURCE_FORBIDDEN");
  });

  it.each(["workspace:^", "workspace:~", "1.0.0"])(
    "allows only workspace:* for internal dependency version %s",
    async (version) => {
      const root = await createRepository();
      const path = "apps/web/package.json";
      const manifest = await readManifest(root, path);
      (manifest.dependencies as Record<string, string>)["@huoqiu/ui"] = version;
      await writeJson(root, path, manifest);

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("WORKSPACE_PROTOCOL_INVALID");
    },
  );

  it("rejects malformed package manifests", async () => {
    const root = await createRepository();
    await writeText(root, "packages/ui/package.json", '{"name":"@huoqiu/ui",}');

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_MANIFEST_MALFORMED");
  });

  it.each([
    ["minimumReleaseAge: 1440", "minimumReleaseAge: 1439"],
    ["minimumReleaseAgeStrict: true", "minimumReleaseAgeStrict: false"],
    [
      "minimumReleaseAgeIgnoreMissingTime: false",
      "minimumReleaseAgeIgnoreMissingTime: true",
    ],
    ["trustLockfile: false", "trustLockfile: true"],
    ["blockExoticSubdeps: true", "blockExoticSubdeps: false"],
  ])("rejects weakened pnpm policy %s", async (expected, weakened) => {
    const root = await createRepository();
    await writeText(
      root,
      "pnpm-workspace.yaml",
      exactWorkspacePolicy.replace(expected, weakened),
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PNPM_POLICY_INVALID");
  });

  it.each([
    "minimumReleaseAge",
    "minimumReleaseAgeStrict",
    "minimumReleaseAgeIgnoreMissingTime",
    "trustLockfile",
    "blockExoticSubdeps",
  ])("rejects missing pnpm policy key %s", async (key) => {
    const root = await createRepository();
    const policy = exactWorkspacePolicy
      .split("\n")
      .filter((line) => !line.startsWith(`${key}:`))
      .join("\n");
    await writeText(root, "pnpm-workspace.yaml", policy);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PNPM_POLICY_INVALID");
  });

  it("rejects minimumReleaseAgeExclude", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "pnpm-workspace.yaml",
      `${exactWorkspacePolicy}minimumReleaseAgeExclude:\n  - react\n`,
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PNPM_RELEASE_AGE_EXCLUDE_FORBIDDEN");
  });

  it.each([
    exactWorkspacePolicy.replace("esbuild: true", "esbuild: false"),
    exactWorkspacePolicy.replace(
      "  esbuild: true",
      "  esbuild: true\n  sharp: true",
    ),
    exactWorkspacePolicy.replace("allowBuilds:\n  esbuild: true\n", ""),
  ])(
    "rejects any install-script allowlist except esbuild true",
    async (policy) => {
      const root = await createRepository();
      await writeText(root, "pnpm-workspace.yaml", policy);

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("PNPM_ALLOW_BUILDS_INVALID");
    },
  );

  it("requires react-native-gesture-handler 2.32.0 exactly", async () => {
    const root = await createRepository();
    const path = "apps/mobile/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>)[
      "react-native-gesture-handler"
    ] = "~2.32.0";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("MOBILE_GESTURE_HANDLER_VERSION_INVALID");
  });

  it("requires the lockfile importer to retain gesture-handler 2.32.0", async () => {
    const root = await createRepository();
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"), "utf8");
    await writeText(
      root,
      "pnpm-lock.yaml",
      lockfile.replace("specifier: 2.32.0", "specifier: ~2.32.0"),
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("LOCKFILE_GESTURE_HANDLER_INVALID");
  });

  it("scans CommonJS TypeScript .cts workspace imports", async () => {
    const root = await createRepository();
    await writeText(
      root,
      "apps/admin/src/runtime.cts",
      'require("@huoqiu/ui/button");\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
    expect(result.stderr).toContain("apps/admin/src/runtime.cts");
  });

  it.each([
    'const load = require; load("@huoqiu/ui/button");\n',
    'module.require("@huoqiu/ui/button");\n',
    'const load = module.require; load("@huoqiu/ui/button");\n',
    'let load; load = require; load("@huoqiu/ui/button");\n',
    'const load = module.require.bind(module); load("@huoqiu/ui/button");\n',
    'const load = require.bind(null); load("@huoqiu/ui/button");\n',
    'module["require"]("@huoqiu/ui/button");\n',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("@huoqiu/ui/button");\n',
    'import * as Module from "node:module"; const load = Module.createRequire(import.meta.url); load("@huoqiu/ui/button");\n',
  ])("scans an indirect CommonJS workspace import %s", async (source) => {
    const root = await createRepository();
    const relativePath = "apps/admin/src/indirect-loader.cts";
    await writeText(root, relativePath, source);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNDECLARED_WORKSPACE_IMPORT");
    expect(result.stderr).toContain(relativePath);
  });

  it("rejects a workspace package export whose target is a directory", async () => {
    const root = await createRepository();
    const manifestPath = "packages/ui/package.json";
    const manifest = await readManifest(root, manifestPath);
    manifest.exports = { "./button": "./src" };
    await writeJson(root, manifestPath, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_NOT_FILE");
    expect(result.stderr).toContain("packages/ui/src");
  });

  it("accepts an exact package export to a versioned contract fixture", async () => {
    const root = await createRepository();
    const webManifestPath = "apps/web/package.json";
    const webManifest = await readManifest(root, webManifestPath);
    (webManifest.dependencies as Record<string, string>)["@huoqiu/contracts"] =
      "workspace:*";
    await writeJson(root, webManifestPath, webManifest);
    await writeJson(root, "packages/contracts/package.json", {
      ...workspacePackage("@huoqiu/contracts"),
      exports: { "./d0/fixture": "./fixtures/d0.v1.json" },
    });
    await writeJson(root, "packages/contracts/fixtures/d0.v1.json", {
      version: 1,
    });
    await writeText(
      root,
      "apps/web/src/d0-fixture.ts",
      'import fixture from "@huoqiu/contracts/d0/fixture";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    ["./unrelated-secret", "./fixtures/d0.v1.json", "d0.v1.json"],
    ["./d0/fixture", "./fixtures/secret.v9.json", "secret.v9.json"],
    ["./d0/fixture", "./fixtures/other.v1.json", "other.v1.json"],
  ])(
    "does not widen the D0 fixture exception for export %s to %s",
    async (exportKey, exportTarget, fixtureName) => {
      const root = await createRepository();
      const webManifestPath = "apps/web/package.json";
      const webManifest = await readManifest(root, webManifestPath);
      (webManifest.dependencies as Record<string, string>)[
        "@huoqiu/contracts"
      ] = "workspace:*";
      await writeJson(root, webManifestPath, webManifest);
      await writeJson(root, "packages/contracts/package.json", {
        ...workspacePackage("@huoqiu/contracts"),
        exports: { [exportKey]: exportTarget },
      });
      await writeJson(root, `packages/contracts/fixtures/${fixtureName}`, {
        version: 1,
      });
      const specifier = `@huoqiu/contracts${exportKey.slice(1)}`;
      await writeText(
        root,
        "apps/web/src/secret.ts",
        `import fixture from "${specifier}";\nvoid fixture;\n`,
      );

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
      expect(result.stderr).toContain(fixtureName);
    },
  );

  it("rejects a relative import to a versioned contract fixture", async () => {
    const root = await createRepository();
    await writeJson(
      root,
      "packages/contracts/package.json",
      workspacePackage("@huoqiu/contracts"),
    );
    await writeJson(root, "packages/contracts/fixtures/d0.v1.json", {
      version: 1,
    });
    await writeText(
      root,
      "apps/web/src/d0-fixture.ts",
      'import fixture from "../../../packages/contracts/fixtures/d0.v1.json";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });

  it("rejects a wildcard package export to a versioned contract fixture", async () => {
    const root = await createRepository();
    const webManifestPath = "apps/web/package.json";
    const webManifest = await readManifest(root, webManifestPath);
    (webManifest.dependencies as Record<string, string>)["@huoqiu/contracts"] =
      "workspace:*";
    await writeJson(root, webManifestPath, webManifest);
    await writeJson(root, "packages/contracts/package.json", {
      ...workspacePackage("@huoqiu/contracts"),
      exports: { "./d0/*": "./fixtures/*.json" },
    });
    await writeJson(root, "packages/contracts/fixtures/d0.v1.json", {
      version: 1,
    });
    await writeText(
      root,
      "apps/web/src/d0-fixture.ts",
      'import fixture from "@huoqiu/contracts/d0/d0.v1";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });

  it.each([
    ["a nested test fixture", "./fixtures/test/d0.v1.json"],
    ["a negative fixture", "./fixtures/d0-negative.v1.json"],
    ["an unversioned fixture", "./fixtures/d0.json"],
    ["a traversing fixture target", "./fixtures/../fixtures/d0.v1.json"],
  ])("rejects an exact package export to %s", async (_label, targetPath) => {
    const root = await createRepository();
    const webManifestPath = "apps/web/package.json";
    const webManifest = await readManifest(root, webManifestPath);
    (webManifest.dependencies as Record<string, string>)["@huoqiu/contracts"] =
      "workspace:*";
    await writeJson(root, webManifestPath, webManifest);
    await writeJson(root, "packages/contracts/package.json", {
      ...workspacePackage("@huoqiu/contracts"),
      exports: { "./d0/fixture": targetPath },
    });
    await writeJson(root, `packages/contracts/${targetPath.slice(2)}`, {
      version: 1,
    });
    await writeText(
      root,
      "apps/web/src/d0-fixture.ts",
      'import fixture from "@huoqiu/contracts/d0/fixture";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });
});
