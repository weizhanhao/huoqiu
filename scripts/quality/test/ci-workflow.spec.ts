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

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const PNPM_SETUP_SHA = "c9883cc79df532ad1a7b81bf9ab944ceb090d65c";
const UPLOAD_SHA = "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";

const validWorkflow = `name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

env:
  NEXT_TELEMETRY_DISABLED: "1"
  EXPO_NO_TELEMETRY: "1"
  TURBO_TELEMETRY_DISABLED: "1"

jobs:
  preflight:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@${CHECKOUT_SHA} # v7.0.1
        with:
          persist-credentials: false
      - name: Set up pnpm and Node
        uses: pnpm/setup@${PNPM_SETUP_SHA} # v2.0.0
        with:
          version: 11.4.0
          runtime: node@24.15.0
          install: false
          cache: false
      - name: Verify toolchain
        shell: bash
        run: |
          set -euo pipefail
          test "$(node --version)" = "v24.15.0"
          test "$(pnpm --version)" = "11.4.0"
      - name: Install dependencies
        shell: bash
        run: pnpm install --frozen-lockfile --strict-peer-dependencies
      - name: Verify generated state is clean
        shell: bash
        run: git diff --exit-code

  quality:
    name: Quality (\${{ matrix.lane }})
    needs: preflight
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        lane: [format, lint, typecheck, test, build, boundaries, dependency-audit]
    steps:
      - name: Check out repository
        uses: actions/checkout@${CHECKOUT_SHA} # v7.0.1
        with:
          persist-credentials: false
      - name: Set up pnpm and Node
        uses: pnpm/setup@${PNPM_SETUP_SHA} # v2.0.0
        with:
          version: 11.4.0
          runtime: node@24.15.0
          install: false
          cache: false
      - name: Install dependencies
        shell: bash
        run: pnpm install --frozen-lockfile --strict-peer-dependencies
      - name: Run fixed quality lane
        shell: bash
        run: |
          set -euo pipefail
          case "\${{ matrix.lane }}" in
            format) pnpm format:check ;;
            lint) pnpm lint ;;
            typecheck) pnpm typecheck ;;
            test)
              mkdir -p test-results
              pnpm test 2>&1 | tee test-results/unit.log
              ;;
            build) pnpm build ;;
            boundaries) pnpm qa:boundaries ;;
            dependency-audit) pnpm qa:dependency-patch ;;
            *) exit 64 ;;
          esac
      - name: Upload unit-test log
        if: \${{ always() && matrix.lane == 'test' }}
        uses: actions/upload-artifact@${UPLOAD_SHA} # v7.0.1
        with:
          name: unit-test-log-\${{ github.run_id }}-\${{ github.run_attempt }}
          path: test-results/unit.log
          if-no-files-found: error
          retention-days: 7
`;

const validInventory = {
  schema_version: 1,
  actions: [
    {
      owner: "actions",
      repository: "checkout",
      release: "v7.0.1",
      commit_sha: CHECKOUT_SHA,
      source_url: "https://github.com/actions/checkout",
      license: "MIT",
      platform_owner: "platform-engineering",
    },
    {
      owner: "pnpm",
      repository: "setup",
      release: "v2.0.0",
      commit_sha: PNPM_SETUP_SHA,
      source_url: "https://github.com/pnpm/setup",
      license: "MIT",
      platform_owner: "platform-engineering",
    },
    {
      owner: "actions",
      repository: "upload-artifact",
      release: "v7.0.1",
      commit_sha: UPLOAD_SHA,
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

const writeInventory = async (
  root: string,
  inventory: unknown,
): Promise<void> =>
  await writeText(
    root,
    "security/artifact-inventory.yml",
    `${JSON.stringify(inventory, null, 2)}\n`,
  );

const createRepository = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "huoqiu-ci-"));
  temporaryRoots.push(root);
  await writeText(root, ".github/workflows/ci.yml", validWorkflow);
  await writeInventory(root, validInventory);
  return root;
};

const runChecker = async (
  root: string,
): Promise<{ code: number; stderr: string }> => {
  try {
    const result = await execFile(
      process.execPath,
      [tsxCliPath, checkerPath, "--scope", "ci"],
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

const replaceWorkflow = async (
  root: string,
  from: string,
  to: string,
): Promise<void> => {
  const path = resolve(root, ".github/workflows/ci.yml");
  const workflow = await readFile(path, "utf8");
  expect(workflow).toContain(from);
  await writeText(root, ".github/workflows/ci.yml", workflow.replace(from, to));
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(async (root) => await rm(root, { recursive: true })),
  );
});

describe("least-privilege CI workflow and artifact inventory", () => {
  it("accepts the pinned seven-lane workflow and exact inventory", async () => {
    const root = await createRepository();

    expect(await runChecker(root)).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    ["permissions:\n  contents: read", '"permissions": {"contents": read}'],
    [
      "permissions:\n  contents: read",
      "permissions: &least_privilege\n  contents: read",
    ],
  ])(
    "accepts YAML 1.2 syntax with the same least-privilege meaning",
    async (from, to) => {
      const root = await createRepository();
      await replaceWorkflow(root, from, to);

      expect(await runChecker(root)).toEqual({ code: 0, stderr: "" });
    },
  );

  it("rejects a quoted uses key that text matching cannot see", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "      - name: Verify toolchain",
      `      - name: Hidden Action\n        "uses": example/tool@${"a".repeat(40)}\n      - name: Verify toolchain`,
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ACTION_NOT_IN_INVENTORY");
  });

  it.each([
    [
      "  contents: read",
      '  "contents": read\n  "id-token": write',
      "CI_PERMISSIONS_EXCESS",
    ],
    [
      "      - name: Install dependencies",
      '      - "continue-on-error": true\n      - name: Install dependencies',
      "CI_CONTINUE_ON_ERROR_FORBIDDEN",
    ],
    [
      "      - name: Install dependencies",
      "      - continue-on-error: &bypass true\n      - name: Alias bypass\n        continue-on-error: *bypass\n      - name: Install dependencies",
      "CI_CONTINUE_ON_ERROR_FORBIDDEN",
    ],
  ])("rejects semantic YAML bypass %s", async (from, to, code) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(code);
  });

  it.each([
    "permissions:\n  contents: read\npermissions:\n  contents: read",
    "permissions:\n contents: read\n  malformed: value",
  ])("fails closed on malformed or duplicate workflow YAML", async (yaml) => {
    const root = await createRepository();
    await writeText(root, ".github/workflows/ci.yml", yaml);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_WORKFLOW_MALFORMED");
  });

  it.each([
    [
      "name: CI",
      "name: CI\nunexpected-root-policy: true",
      "CI_WORKFLOW_SCHEMA_INVALID",
    ],
    [
      "    runs-on: ubuntu-24.04",
      "    unexpected-job-policy: true\n    runs-on: ubuntu-24.04",
      "CI_JOB_POLICY_INVALID",
    ],
    [
      "      - name: Verify toolchain",
      "      - name: Verify toolchain\n        unexpected-step-policy: true",
      "CI_JOB_POLICY_INVALID",
    ],
  ])("fails closed on unknown workflow fields %s", async (from, to, code) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(code);
  });

  it.each([
    ["        shell: bash", '        shell: "bash {0}; exit 0"'],
    ["          esac", "          esac\n          exit 0"],
    [
      '          test "$(pnpm --version)" = "11.4.0"',
      '          test "$(pnpm --version)" = "11.4.0"\n          echo bypass',
    ],
    [
      "            format) pnpm format:check ;;",
      "            format) pnpm format:check ;; # appended command text",
    ],
    ["      - name: Verify toolchain", "      - name: Looks equivalent"],
  ])("requires the exact canonical step field values %s", async (from, to) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_STEP_POLICY_INVALID");
  });

  it("parses the artifact inventory as real YAML 1.2", async () => {
    const root = await createRepository();
    const inventoryYaml = [
      "schema_version: 1",
      "actions:",
      "  - owner: actions",
      "    repository: checkout",
      "    release: v7.0.1",
      `    commit_sha: ${CHECKOUT_SHA}`,
      "    source_url: https://github.com/actions/checkout",
      "    license: MIT",
      "    platform_owner: platform-engineering",
      "  - owner: pnpm",
      "    repository: setup",
      "    release: v2.0.0",
      `    commit_sha: ${PNPM_SETUP_SHA}`,
      "    source_url: https://github.com/pnpm/setup",
      "    license: MIT",
      "    platform_owner: platform-engineering",
      "  - owner: actions",
      "    repository: upload-artifact",
      "    release: v7.0.1",
      `    commit_sha: ${UPLOAD_SHA}`,
      "    source_url: https://github.com/actions/upload-artifact",
      "    license: MIT",
      "    platform_owner: platform-engineering",
      "artifacts:",
      "  - name: unit-test-log-${{ github.run_id }}-${{ github.run_attempt }}",
      "    path: test-results/unit.log",
      "    classification: internal-ci-test-log",
      "    retention_days: 7",
      "",
    ].join("\n");
    await writeText(root, "security/artifact-inventory.yml", inventoryYaml);

    expect(await runChecker(root)).toEqual({ code: 0, stderr: "" });
  });

  it.each([
    [`actions/checkout@${CHECKOUT_SHA}`, "actions/checkout@v7.0.1"],
    [`pnpm/setup@${PNPM_SETUP_SHA}`, "pnpm/setup@main"],
    [`actions/upload-artifact@${UPLOAD_SHA}`, "actions/upload-artifact@v7"],
  ])("rejects an unpinned Action %s", async (pinned, unpinned) => {
    const root = await createRepository();
    await replaceWorkflow(root, pinned, unpinned);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ACTION_UNPINNED");
  });

  it("rejects an unregistered workflow Action", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "      - name: Verify toolchain",
      `      - name: Unknown Action\n        uses: example/tool@${"a".repeat(40)}\n      - name: Verify toolchain`,
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ACTION_NOT_IN_INVENTORY");
  });

  it.each([
    ["pull_request:", "pull_request_target:", "CI_TRIGGER_INVALID"],
    [
      "  pull_request:\n",
      "  pull_request:\n  workflow_dispatch:\n",
      "CI_TRIGGER_INVALID",
    ],
    ["  contents: read", "  contents: write", "CI_PERMISSIONS_EXCESS"],
    [
      "  contents: read",
      "  contents: read\n  id-token: write",
      "CI_PERMISSIONS_EXCESS",
    ],
    [
      "    timeout-minutes: 20",
      "    timeout-minutes: 0",
      "CI_JOB_POLICY_INVALID",
    ],
    [
      "    runs-on: ubuntu-24.04",
      "    runs-on: ubuntu-latest",
      "CI_JOB_POLICY_INVALID",
    ],
  ])("rejects unsafe workflow mutation %s", async (from, to, code) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(code);
  });

  it("requires PR concurrency cancellation", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      "  cancel-in-progress: false",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_CONCURRENCY_INVALID");
  });

  it.each([
    ["          version: 11.4.0", "          version: latest"],
    ["          runtime: node@24.15.0", "          runtime: node@24"],
    ["          install: false", "          install: true"],
    ["          cache: false", "          cache: true"],
    [
      "          persist-credentials: false",
      "          persist-credentials: true",
    ],
  ])("rejects weakened checkout/setup input %s", async (from, to) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_BOOTSTRAP_INVALID");
  });

  it.each([
    [
      "pnpm install --frozen-lockfile --strict-peer-dependencies",
      "pnpm install --strict-peer-dependencies",
    ],
    [
      "pnpm install --frozen-lockfile --strict-peer-dependencies",
      "pnpm install --frozen-lockfile",
    ],
    [
      "pnpm install --frozen-lockfile --strict-peer-dependencies",
      "pnpm install --frozen-lockfile --strict-peer-dependencies --trust-lockfile",
    ],
    [
      "pnpm install --frozen-lockfile --strict-peer-dependencies",
      "pnpm install --no-frozen-lockfile --strict-peer-dependencies",
    ],
  ])("rejects non-strict install command %s", async (from, to) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_INSTALL_INVALID");
  });

  it("requires exact Node/pnpm verification and a clean diff in preflight", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      '          test "$(node --version)" = "v24.15.0"\n',
      "",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_PREFLIGHT_INVALID");
  });

  it("requires exactly seven fixed lanes", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "lane: [format, lint, typecheck, test, build, boundaries, dependency-audit]",
      "lane: [format, lint, typecheck, test, build, boundaries, dependency-audit, e2e]",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_MATRIX_INVALID");
  });

  it("requires the dependency audit lane", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "lane: [format, lint, typecheck, test, build, boundaries, dependency-audit]",
      "lane: [format, lint, typecheck, test, build, boundaries]",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_MATRIX_INVALID");
  });

  it("requires the fixed dependency audit command", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      "            dependency-audit) pnpm qa:dependency-patch ;;\n",
      "            dependency-audit) pnpm qa:boundaries ;;\n",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_MATRIX_INVALID");
  });

  it("rejects executing the matrix expression as a command", async () => {
    const root = await createRepository();
    await replaceWorkflow(
      root,
      '          case "${{ matrix.lane }}" in',
      "          pnpm ${{ matrix.lane }}\n          case lint in",
    );

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_MATRIX_COMMAND_UNSAFE");
  });

  it.each([
    ["          set -euo pipefail", "          set -eu"],
    ["tee test-results/unit.log", "tee test-results/all.log"],
  ])(
    "requires pipefail and only the exact unit-test log %s",
    async (from, to) => {
      const root = await createRepository();
      await replaceWorkflow(root, from, to);

      const result = await runChecker(root);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("CI_TEST_LOG_INVALID");
    },
  );

  it.each([
    ["          path: test-results/unit.log", "          path: test-results/"],
    ["          path: test-results/unit.log", "          path: '**/*'"],
    [
      "          path: test-results/unit.log",
      "          path: .env.production",
    ],
    ["          path: test-results/unit.log", "          path: database.dump"],
    ["          path: test-results/unit.log", "          path: node_modules"],
    ["          path: test-results/unit.log", "          path: .next"],
    ["          path: test-results/unit.log", "          path: dist"],
    [
      "          path: test-results/unit.log",
      "          path: artifacts/evidence",
    ],
  ])("rejects broad or sensitive upload path %s", async (from, to) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ARTIFACT_PATH_FORBIDDEN");
  });

  it.each([
    [
      "if: ${{ always() && matrix.lane == 'test' }}",
      "if: ${{ matrix.lane == 'test' }}",
    ],
    ["if-no-files-found: error", "if-no-files-found: ignore"],
    [
      "name: unit-test-log-${{ github.run_id }}-${{ github.run_attempt }}",
      "name: unit-test-log",
    ],
    ["retention-days: 7", "retention-days: 90"],
  ])("rejects weakened artifact upload setting %s", async (from, to) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ARTIFACT_POLICY_INVALID");
  });

  it.each([
    [
      "      - name: Install dependencies",
      "      - continue-on-error: true\n      - name: Install dependencies",
      "CI_CONTINUE_ON_ERROR_FORBIDDEN",
    ],
    ["pnpm lint ;;", "pnpm lint || true ;;", "CI_ERROR_SUPPRESSION_FORBIDDEN"],
    [
      '  NEXT_TELEMETRY_DISABLED: "1"',
      '  SECRET_TOKEN: ${{ secrets.TOKEN }}\n  NEXT_TELEMETRY_DISABLED: "1"',
      "CI_SECRET_FORBIDDEN",
    ],
  ])("rejects error or secret bypass %s", async (from, to, code) => {
    const root = await createRepository();
    await replaceWorkflow(root, from, to);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(code);
  });

  it("requires all telemetry controls", async () => {
    const root = await createRepository();
    await replaceWorkflow(root, '  EXPO_NO_TELEMETRY: "1"\n', "");

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_TELEMETRY_INVALID");
  });

  it("rejects an inventory action that does not match the workflow", async () => {
    const root = await createRepository();
    const inventory = structuredClone(validInventory);
    const action = inventory.actions[0];
    if (action === undefined) throw new Error("missing test action");
    action.commit_sha = "f".repeat(40);
    await writeInventory(root, inventory);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CI_ACTION_NOT_IN_INVENTORY");
  });

  it("rejects unknown inventory fields", async () => {
    const root = await createRepository();
    const inventory = structuredClone(
      validInventory,
    ) as typeof validInventory & {
      notes?: string;
    };
    inventory.notes = "not schema-controlled";
    await writeInventory(root, inventory);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ARTIFACT_INVENTORY_SCHEMA_INVALID");
  });

  it.each([
    ["release", "v0.0.0"],
    ["license", "Apache-2.0"],
    ["owner", "unknown"],
    ["source_url", "https://example.invalid/action"],
    ["platform_owner", "nobody"],
  ] as const)("rejects invalid action inventory %s", async (field, value) => {
    const root = await createRepository();
    const inventory = structuredClone(validInventory);
    const action = inventory.actions[0];
    if (action === undefined) throw new Error("missing test action");
    action[field] = value;
    await writeInventory(root, inventory);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ARTIFACT_INVENTORY_ACTION_INVALID");
  });

  it("rejects an inventory artifact that does not match the workflow", async () => {
    const root = await createRepository();
    const inventory = structuredClone(validInventory);
    const artifact = inventory.artifacts[0];
    if (artifact === undefined) throw new Error("missing test artifact");
    artifact.path = "test-results/other.log";
    await writeInventory(root, inventory);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ARTIFACT_INVENTORY_MISMATCH");
  });

  it("rejects more than the single unit-test artifact", async () => {
    const root = await createRepository();
    const inventory = structuredClone(validInventory);
    inventory.artifacts.push({
      name: "extra",
      path: "test-results/extra.log",
      classification: "internal-ci-test-log",
      retention_days: 7,
    });
    await writeInventory(root, inventory);

    const result = await runChecker(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ARTIFACT_INVENTORY_MISMATCH");
  });
});
