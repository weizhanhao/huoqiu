import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMainModule,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

type D0Capability =
  | "CAP-FEED-001"
  | "CAP-ID-001"
  | "CAP-INST-001"
  | "CAP-MD-001"
  | "CAP-WATCH-001";

type TestScope = Readonly<{
  config: string;
  cwd: string;
  files: readonly string[];
}>;

const scopes: Readonly<Record<D0Capability, TestScope>> = {
  "CAP-ID-001": {
    config: "vitest.config.ts",
    cwd: resolve(repositoryRoot, "apps/mobile"),
    files: ["tests/component/d0/routes.spec.tsx"],
  },
  "CAP-INST-001": {
    config: "vitest.config.ts",
    cwd: resolve(repositoryRoot, "apps/mobile"),
    files: ["tests/component/d0/instrument-chart.spec.tsx"],
  },
  "CAP-MD-001": {
    config: "packages/config/vitest/base.ts",
    cwd: repositoryRoot,
    files: [
      "packages/contracts/test/d0-fixture.contract.spec.ts",
      "packages/contracts/test/synthetic-market-fixture.spec.ts",
    ],
  },
  "CAP-FEED-001": {
    config: "vitest.config.ts",
    cwd: resolve(repositoryRoot, "apps/mobile"),
    files: ["tests/component/d0/feed.spec.tsx"],
  },
  "CAP-WATCH-001": {
    config: "vitest.config.ts",
    cwd: resolve(repositoryRoot, "apps/mobile"),
    files: ["tests/component/d0/watchlist.spec.tsx"],
  },
};

type VitestJsonReport = Readonly<{
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numTotalTests: number;
  success: boolean;
}>;

const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const parseReport = (stdout: string): VitestJsonReport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new QualityGateError(
      "CAPABILITY_REPORT_INVALID",
      "Vitest did not emit one JSON report",
    );
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new QualityGateError(
      "CAPABILITY_REPORT_INVALID",
      "Vitest JSON report must be an object",
    );
  const report = parsed as Record<string, unknown>;
  for (const field of [
    "numFailedTests",
    "numPassedTests",
    "numPendingTests",
    "numTodoTests",
    "numTotalTests",
  ] as const) {
    if (!integer(report[field]))
      throw new QualityGateError(
        "CAPABILITY_REPORT_INVALID",
        `Vitest ${field} must be a non-negative safe integer`,
      );
  }
  if (typeof report.success !== "boolean")
    throw new QualityGateError(
      "CAPABILITY_REPORT_INVALID",
      "Vitest success must be boolean",
    );
  return report as unknown as VitestJsonReport;
};

const runScope = async (scope: TestScope): Promise<VitestJsonReport> =>
  await new Promise((resolvePromise, rejectPromise) => {
    const vitestCli = resolve(
      dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
      "vitest.mjs",
    );
    execFile(
      process.execPath,
      [
        vitestCli,
        "run",
        "--config",
        scope.config,
        ...scope.files,
        "--reporter=json",
      ],
      {
        cwd: scope.cwd,
        env: {
          CI: "1",
          HOME: "/var/empty",
          LANG: "C",
          LC_ALL: "C",
          PATH: "/usr/bin:/bin",
          TMPDIR: "/tmp",
        },
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          rejectPromise(
            new QualityGateError(
              "CAPABILITY_COMMAND_FAILED",
              `${error.message}; stderr=${stderr.trim()}`,
            ),
          );
          return;
        }
        try {
          resolvePromise(parseReport(stdout));
        } catch (reportError) {
          rejectPromise(reportError);
        }
      },
    );
  });

const parseCapability = (args: string[]): D0Capability => {
  const flags = parseStrictFlags(args, new Set(["--cap"]));
  const cap = requiredFlag(flags, "--cap");
  if (!(cap in scopes))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      `${cap} is not a D0 capability`,
    );
  return cap as D0Capability;
};

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  const cap = parseCapability(args);
  const report = await runScope(scopes[cap]);
  const skipped = report.numPendingTests + report.numTodoTests;
  if (
    !report.success ||
    report.numFailedTests !== 0 ||
    skipped !== 0 ||
    report.numPassedTests === 0 ||
    report.numTotalTests !== report.numPassedTests
  )
    throw new QualityGateError(
      "CAPABILITY_COMMAND_FAILED",
      `${cap} passed=${report.numPassedTests} failed=${report.numFailedTests} skipped=${skipped} total=${report.numTotalTests}`,
    );
  process.stdout.write(
    `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
      fixture_version: "d0.v1",
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    })}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
