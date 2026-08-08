import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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
  await writeJson(
    root,
    "packages/ui/package.json",
    workspacePackage(
      "@huoqiu/ui",
      {},
      { "@huoqiu/config": "workspace:*", typescript: "6.0.3" },
    ),
  );
  await writeJson(
    root,
    "packages/config/package.json",
    workspacePackage("@huoqiu/config", { typescript: "6.0.3" }),
  );
  await writeText(
    root,
    "apps/web/src/index.ts",
    'export { Button } from "@huoqiu/ui/button";\n',
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
});
