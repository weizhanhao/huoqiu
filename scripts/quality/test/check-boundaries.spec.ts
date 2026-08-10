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
  cpu-features: false
  esbuild: true
  protobufjs: false
  ssh2: false
`;

const exactContainerInventory = {
  schema_version: 2,
  actions: [
    {
      owner: "actions",
      repository: "checkout",
      release: "v7.0.1",
      commit_sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
      source_url: "https://github.com/actions/checkout",
      license: "MIT",
      platform_owner: "platform-engineering",
    },
    {
      owner: "pnpm",
      repository: "setup",
      release: "v2.0.0",
      commit_sha: "c9883cc79df532ad1a7b81bf9ab944ceb090d65c",
      source_url: "https://github.com/pnpm/setup",
      license: "MIT",
      platform_owner: "platform-engineering",
    },
    {
      owner: "actions",
      repository: "upload-artifact",
      release: "v7.0.1",
      commit_sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      source_url: "https://github.com/actions/upload-artifact",
      license: "MIT",
      platform_owner: "platform-engineering",
    },
  ],
  artifacts: [
    {
      name: "unit-test-log-${{ github.run_id }}-${{ github.run_attempt }}",
      path: "test-results/unit.log",
      classification: "internal-ci-test-log",
      retention_days: 7,
    },
  ],
  container_images: [
    {
      repository: "docker.io/library/postgres",
      release: "17.10-bookworm",
      immutable_reference:
        "docker.io/library/postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f",
      repo_digest:
        "sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f",
      source_commit: "4f9ced003ba58a854656ba150d146243d27ae3ac",
      source_url:
        "https://github.com/docker-library/postgres/tree/4f9ced003ba58a854656ba150d146243d27ae3ac/17/bookworm",
      distribution_url: "https://hub.docker.com/_/postgres",
      licenses: ["PostgreSQL", "MIT"],
      platform_owner: "platform-engineering",
      platforms: [
        {
          platform: "linux/amd64",
          manifest_digest:
            "sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923",
          config_digest:
            "sha256:8164afa59e26be9f78959e538d6c9da8553d67e601d8ebd0d5e9cbf558c3986e",
          compressed_size_bytes: 156095657,
        },
        {
          platform: "linux/arm64/v8",
          manifest_digest:
            "sha256:3aac91d19d5b7aff4c650dddfacc1a26c436459aafd4eb51ab0bf1748e990dbb",
          config_digest:
            "sha256:6878867d6da44d8c000a91f9ce8d31a613bdc3e26b4ae4dde11bc2e22d270458",
          compressed_size_bytes: 154122115,
        },
      ],
    },
    {
      repository: "docker.io/valkey/valkey",
      release: "9.1.1",
      immutable_reference:
        "docker.io/valkey/valkey:9.1.1@sha256:3acc0687f2a2e1091fae6450d7842dd658c941338cf0a873ddd9e14b9e4ea4dd",
      repo_digest:
        "sha256:3acc0687f2a2e1091fae6450d7842dd658c941338cf0a873ddd9e14b9e4ea4dd",
      source_commit: "d27f9ba65a04e80d9c417112a7621fc98a56f70d",
      source_url:
        "https://github.com/valkey-io/valkey/tree/d27f9ba65a04e80d9c417112a7621fc98a56f70d",
      distribution_url: "https://hub.docker.com/r/valkey/valkey",
      licenses: ["BSD-3-Clause"],
      platform_owner: "platform-engineering",
      platforms: [
        {
          platform: "linux/amd64",
          manifest_digest:
            "sha256:2f4a4b0a42a72569b40567fae9016dc54aa76736250be28120b5fced8050c0f0",
          config_digest:
            "sha256:2309a3c09231d6c1ab50e259e36d2578f45d271d19d6dc3908711b088890e0b8",
          compressed_size_bytes: 44303326,
        },
        {
          platform: "linux/arm64",
          manifest_digest:
            "sha256:7295255fcb711fd8b77e489e247be018940eeda917eb3a430cabd089355b293e",
          config_digest:
            "sha256:58058761276174a4176215cae8fe03a59329f15adaa2b899b465657c1802b578",
          compressed_size_bytes: 44697854,
        },
      ],
    },
    {
      repository: "cr.jaegertracing.io/jaegertracing/jaeger",
      release: "2.20.0",
      immutable_reference:
        "cr.jaegertracing.io/jaegertracing/jaeger:2.20.0@sha256:46a886260e04002d8f45e213fc39063fa11a50446048fdaa64786fc0840cb9f8",
      repo_digest:
        "sha256:46a886260e04002d8f45e213fc39063fa11a50446048fdaa64786fc0840cb9f8",
      source_commit: "d65f95169d71c3a8535355ececa782aa868071be",
      source_url:
        "https://github.com/jaegertracing/jaeger/tree/d65f95169d71c3a8535355ececa782aa868071be",
      distribution_url:
        "https://www.jaegertracing.io/docs/2.20/getting-started/",
      licenses: ["Apache-2.0"],
      platform_owner: "platform-engineering",
      platforms: [
        {
          platform: "linux/amd64",
          manifest_digest:
            "sha256:4a130978c31a30d9baadd9fd902eeb779ed7bf2efd53e8b17bd79069e689da1b",
          config_digest:
            "sha256:9ae01775e2b2d4a7a957647fe6e733fe17ca8a2cec87ec8c893f730afe49bf00",
          compressed_size_bytes: 50161833,
        },
        {
          platform: "linux/arm64",
          manifest_digest:
            "sha256:1f94d894a3428ea91be4d79f92a743e7994a355b1919bbe7e7ecd59f19631fb0",
          config_digest:
            "sha256:7f9e11694bb8d2a2f6b570e66ab8f984413ea041ef3f1ecda9a1584657154d43",
          compressed_size_bytes: 46903702,
        },
      ],
    },
  ],
};

type ContainerInventoryFixture = typeof exactContainerInventory;
type ContainerImageFixture =
  ContainerInventoryFixture["container_images"][number];
type ContainerPlatformFixture = ContainerImageFixture["platforms"][number];

const firstContainerImage = (
  inventory: ContainerInventoryFixture,
): ContainerImageFixture => {
  const image = inventory.container_images[0];
  if (image === undefined) throw new Error("missing container image fixture");
  return image;
};

const firstContainerPlatform = (
  inventory: ContainerInventoryFixture,
): ContainerPlatformFixture => {
  const platform = firstContainerImage(inventory).platforms[0];
  if (platform === undefined) throw new Error("missing platform fixture");
  return platform;
};

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

const runChecker = async (
  root: string,
  scope: "ci" | "workspace" = "workspace",
): Promise<CheckerResult> => {
  try {
    const result = await execFile(
      process.execPath,
      [tsxCliPath, checkerPath, "--scope", scope],
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

const createCiRepository = async (inventory: unknown): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "huoqiu-container-inventory-"));
  temporaryRoots.push(root);
  await writeText(
    root,
    ".github/workflows/ci.yml",
    await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
  );
  await writeJson(root, "security/artifact-inventory.yml", inventory);
  return root;
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

  it("rejects an npm alias targeting an existing workspace project", async () => {
    const root = await createRepository();
    const path = "packages/config/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>).webAlias =
      "npm:@huoqiu/web@0.0.0";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_ALIAS_FORBIDDEN");
  });

  it("rejects an npm alias targeting an unknown reserved workspace name", async () => {
    const root = await createRepository();
    const path = "packages/config/package.json";
    const manifest = await readManifest(root, path);
    (manifest.dependencies as Record<string, string>).ghostAlias =
      "npm:@huoqiu/ghost@1.0.0";
    await writeJson(root, path, manifest);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("UNKNOWN_WORKSPACE_DEPENDENCY");
  });

  it.each([
    ["spikes", "auth/package.json"],
    ["spikes/auth", "package.json"],
  ])(
    "rejects the required auth workspace through symlinked component %s",
    async (workspacePath, outsideManifestPath) => {
      const root = await createRepository();
      const outsideRoot = await mkdtemp(
        resolve(tmpdir(), "huoqiu-auth-spike-"),
      );
      temporaryRoots.push(outsideRoot);
      await writeJson(
        outsideRoot,
        outsideManifestPath,
        workspacePackage("@huoqiu/auth-spike", { typescript: "6.0.3" }),
      );
      await rm(resolve(root, workspacePath), { recursive: true });
      await symlink(outsideRoot, resolve(root, workspacePath), "dir");

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("WORKSPACE_SYMLINK_FORBIDDEN");
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
    exactWorkspacePolicy.replace("cpu-features: false", "cpu-features: true"),
    exactWorkspacePolicy.replace("protobufjs: false", "protobufjs: true"),
    exactWorkspacePolicy.replace("ssh2: false", "ssh2: true"),
    exactWorkspacePolicy.replace(
      "  ssh2: false",
      "  ssh2: false\n  sharp: true",
    ),
    exactWorkspacePolicy.replace(
      "allowBuilds:\n  cpu-features: false\n  esbuild: true\n  protobufjs: false\n  ssh2: false\n",
      "",
    ),
  ])(
    "rejects any install-script policy except the exact reviewed allow/deny map",
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

  it("accepts only the exact M1 fixture-data package export", async () => {
    const root = await createRepository();
    const dbManifestPath = "packages/db/package.json";
    await writeJson(root, dbManifestPath, {
      ...workspacePackage("@huoqiu/db"),
      dependencies: { "@huoqiu/contracts": "workspace:*" },
    });
    await writeJson(root, "packages/contracts/package.json", {
      ...workspacePackage("@huoqiu/contracts"),
      exports: { "./m1/fixture-data": "./fixtures/m1.v1.json" },
    });
    await writeJson(root, "packages/contracts/fixtures/m1.v1.json", {
      version: "m1.v1",
    });
    await writeText(
      root,
      "packages/db/src/m1-fixture.ts",
      'import fixture from "@huoqiu/contracts/m1/fixture-data";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    [
      "./m1/fixture-data",
      "./fixtures/other.v1.json",
      "other.v1.json",
      "@huoqiu/contracts/m1/fixture-data",
    ],
    ["./m1/unrelated", "./fixtures/m1.v1.json", "m1.v1.json", "m1.v1.json"],
    ["./m1/*", "./fixtures/*.json", "m1.v1.json", "m1.v1.json"],
  ])(
    "does not widen the M1 fixture-data exception for export %s to %s",
    async (exportKey, exportTarget, fixtureName, expectedDetail) => {
      const root = await createRepository();
      await writeJson(root, "packages/db/package.json", {
        ...workspacePackage("@huoqiu/db"),
        dependencies: { "@huoqiu/contracts": "workspace:*" },
      });
      await writeJson(root, "packages/contracts/package.json", {
        ...workspacePackage("@huoqiu/contracts"),
        exports: { [exportKey]: exportTarget },
      });
      await writeJson(root, `packages/contracts/fixtures/${fixtureName}`, {
        version: "m1.v1",
      });
      const specifier =
        exportKey === "./m1/*"
          ? "@huoqiu/contracts/m1/m1.v1"
          : `@huoqiu/contracts${exportKey.slice(1)}`;
      await writeText(
        root,
        "packages/db/src/m1-fixture.ts",
        `import fixture from "${specifier}";\nvoid fixture;\n`,
      );

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
      expect(result.stderr).toContain(expectedDetail);
    },
  );

  it.each([
    [
      "a direct source redirect",
      { "./m1/fixture-data": "./src/alternate.ts" },
      "packages/contracts/src/alternate.ts",
    ],
    [
      "a conditional alternate source",
      {
        "./m1/fixture-data": {
          import: "./fixtures/m1.v1.json",
          default: "./src/alternate.ts",
        },
      },
      "packages/contracts/src/alternate.ts",
    ],
    [
      "a wildcard source redirect",
      { "./m1/*": "./src/*.ts" },
      "packages/contracts/src/fixture-data.ts",
    ],
  ])(
    "rejects %s for the reserved M1 fixture-data specifier",
    async (_label, exports, sourcePath) => {
      const root = await createRepository();
      await writeJson(root, "packages/db/package.json", {
        ...workspacePackage("@huoqiu/db"),
        dependencies: { "@huoqiu/contracts": "workspace:*" },
      });
      await writeJson(root, "packages/contracts/package.json", {
        ...workspacePackage("@huoqiu/contracts"),
        exports,
      });
      await writeJson(root, "packages/contracts/fixtures/m1.v1.json", {
        version: "m1.v1",
      });
      await writeText(root, sourcePath, "export default {};\n");
      await writeText(
        root,
        "packages/db/src/m1-fixture.ts",
        'import fixture from "@huoqiu/contracts/m1/fixture-data";\nvoid fixture;\n',
      );

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
      expect(result.stderr).toContain("@huoqiu/contracts/m1/fixture-data");
    },
  );

  it("rejects a relative import to the M1 fixture data", async () => {
    const root = await createRepository();
    await writeJson(root, "packages/db/package.json", {
      ...workspacePackage("@huoqiu/db"),
      dependencies: { "@huoqiu/contracts": "workspace:*" },
    });
    await writeJson(
      root,
      "packages/contracts/package.json",
      workspacePackage("@huoqiu/contracts"),
    );
    await writeJson(root, "packages/contracts/fixtures/m1.v1.json", {
      version: "m1.v1",
    });
    await writeText(
      root,
      "packages/db/src/m1-seed.ts",
      'import fixture from "../../contracts/fixtures/m1.v1.json";\nvoid fixture;\n',
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKSPACE_IMPORT_TARGET_EXCLUDED");
  });

  it.each([
    ["./unrelated-secret", "./fixtures/d0.v1.json", "d0.v1.json", "d0.v1.json"],
    [
      "./d0/fixture",
      "./fixtures/secret.v9.json",
      "secret.v9.json",
      "@huoqiu/contracts/d0/fixture",
    ],
    [
      "./d0/fixture",
      "./fixtures/other.v1.json",
      "other.v1.json",
      "@huoqiu/contracts/d0/fixture",
    ],
  ])(
    "does not widen the D0 fixture exception for export %s to %s",
    async (exportKey, exportTarget, fixtureName, expectedDetail) => {
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
      expect(result.stderr).toContain(expectedDetail);
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

describe("container image inventory boundaries", () => {
  it("accepts only the exact approved local-stack image descriptors", async () => {
    const root = await createCiRepository(exactContainerInventory);

    expect(await runChecker(root, "ci")).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    ["a missing approved image", 1],
    ["a reordered approved image", 2],
  ])("rejects %s", async (_label, imageIndex) => {
    const inventory = structuredClone(exactContainerInventory);
    if (imageIndex === 1) inventory.container_images.splice(imageIndex, 1);
    else inventory.container_images.reverse();
    const root = await createCiRepository(inventory);

    const result = await runChecker(root, "ci");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ARTIFACT_INVENTORY_CONTAINER_IMAGE_INVALID",
    );
  });

  it.each([
    [
      "missing container_images",
      (inventory: ContainerInventoryFixture) => {
        delete (inventory as Partial<ContainerInventoryFixture>)
          .container_images;
      },
    ],
    [
      "schema v1",
      (inventory: ContainerInventoryFixture) => {
        inventory.schema_version = 1;
      },
    ],
    [
      "an unknown top-level field",
      (inventory: ContainerInventoryFixture) => {
        Object.assign(inventory, { condition: "ignored" });
      },
    ],
  ])("rejects %s in the v2 inventory envelope", async (_label, mutate) => {
    const inventory = structuredClone(exactContainerInventory);
    mutate(inventory);
    const root = await createCiRepository(inventory);

    const result = await runChecker(root, "ci");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ARTIFACT_INVENTORY_SCHEMA_INVALID");
  });

  it.each([
    [
      "a missing image field",
      (inventory: ContainerInventoryFixture) => {
        delete (
          firstContainerImage(inventory) as Partial<ContainerImageFixture>
        ).distribution_url;
      },
    ],
    [
      "conditional image junk",
      (inventory: ContainerInventoryFixture) => {
        Object.assign(firstContainerImage(inventory), {
          condition: { default: "trusted" },
        });
      },
    ],
    [
      "no image",
      (inventory: ContainerInventoryFixture) => {
        inventory.container_images = [];
      },
    ],
    [
      "a duplicate image",
      (inventory: ContainerInventoryFixture) => {
        inventory.container_images.push(
          structuredClone(firstContainerImage(inventory)),
        );
      },
    ],
    [
      "an unknown image",
      (inventory: ContainerInventoryFixture) => {
        const image = firstContainerImage(inventory);
        image.repository = "docker.io/library/unknown";
        image.immutable_reference = `${image.repository}:${image.release}@${image.repo_digest}`;
      },
    ],
    [
      "a mutable reference",
      (inventory: ContainerInventoryFixture) => {
        const image = firstContainerImage(inventory);
        image.immutable_reference = `${image.repository}:${image.release}`;
      },
    ],
    [
      "an inconsistent reference",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).immutable_reference =
          "docker.io/library/postgres:17.9-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f";
      },
    ],
    [
      "a malformed repository digest",
      (inventory: ContainerInventoryFixture) => {
        const image = firstContainerImage(inventory);
        image.repo_digest = `sha256:${"a".repeat(63)}`;
        image.immutable_reference = `${image.repository}:${image.release}@${image.repo_digest}`;
      },
    ],
    [
      "a mismatched repository digest",
      (inventory: ContainerInventoryFixture) => {
        const image = firstContainerImage(inventory);
        image.repo_digest = `sha256:${"a".repeat(64)}`;
        image.immutable_reference = `${image.repository}:${image.release}@${image.repo_digest}`;
      },
    ],
    [
      "a malformed source commit",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).source_commit = "f".repeat(39);
      },
    ],
    [
      "a mismatched source commit",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).source_commit = "f".repeat(40);
      },
    ],
    [
      "a non-HTTPS source URL",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).source_url =
          "http://github.com/docker-library/postgres";
      },
    ],
    [
      "a mismatched source URL",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).source_url =
          "https://github.com/docker-library/postgres/tree/main/17/bookworm";
      },
    ],
    [
      "a non-HTTPS distribution URL",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).distribution_url =
          "http://hub.docker.com/_/postgres";
      },
    ],
    [
      "a mismatched distribution URL",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).distribution_url =
          "https://example.com/postgres";
      },
    ],
    [
      "no license",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).licenses = [];
      },
    ],
    [
      "a duplicate license",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).licenses = ["MIT", "MIT"];
      },
    ],
    [
      "a mismatched license order",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).licenses = ["MIT", "PostgreSQL"];
      },
    ],
    [
      "a mismatched platform owner",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).platform_owner = "application-team";
      },
    ],
    [
      "no platform",
      (inventory: ContainerInventoryFixture) => {
        firstContainerImage(inventory).platforms = [];
      },
    ],
    [
      "a duplicate platform",
      (inventory: ContainerInventoryFixture) => {
        const image = firstContainerImage(inventory);
        image.platforms.push(
          structuredClone(firstContainerPlatform(inventory)),
        );
      },
    ],
    [
      "conditional platform junk",
      (inventory: ContainerInventoryFixture) => {
        Object.assign(firstContainerPlatform(inventory), {
          condition: { default: "trusted" },
        });
      },
    ],
    [
      "a missing platform field",
      (inventory: ContainerInventoryFixture) => {
        delete (
          firstContainerPlatform(inventory) as Partial<ContainerPlatformFixture>
        ).config_digest;
      },
    ],
    [
      "an unknown platform",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).platform = "linux/s390x";
      },
    ],
    [
      "a malformed manifest digest",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).manifest_digest = "sha256:bad";
      },
    ],
    [
      "a mismatched manifest digest",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).manifest_digest =
          `sha256:${"b".repeat(64)}`;
      },
    ],
    [
      "a malformed config digest",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).config_digest = "sha256:bad";
      },
    ],
    [
      "zero compressed bytes",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).compressed_size_bytes = 0;
      },
    ],
    [
      "fractional compressed bytes",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).compressed_size_bytes = 1.5;
      },
    ],
    [
      "unsafe compressed bytes",
      (inventory: ContainerInventoryFixture) => {
        firstContainerPlatform(inventory).compressed_size_bytes =
          Number.MAX_SAFE_INTEGER + 1;
      },
    ],
  ] as const)("rejects %s", async (_label, mutate) => {
    const inventory = structuredClone(exactContainerInventory);
    mutate(inventory);
    const root = await createCiRepository(inventory);

    const result = await runChecker(root, "ci");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ARTIFACT_INVENTORY_CONTAINER_IMAGE_INVALID",
    );
  });
});
