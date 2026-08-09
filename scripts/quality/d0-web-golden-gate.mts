import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const webRoot = resolve(repositoryRoot, "apps/web");
const nextCli = resolve(webRoot, "node_modules/next/dist/bin/next");

export interface D0WebGoldenSummary {
  failed: number;
  passed: number;
  skipped: number;
}

interface PlaywrightStats {
  expected: number;
  flaky: number;
  skipped: number;
  unexpected: number;
}

const nonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const notVerified = (reason: string): never => {
  throw new QualityGateError("D0_WEB_NOT_VERIFIED", reason);
};

export const playwrightArguments = (): string[] => [
  "test",
  "-c",
  "tests/e2e/playwright.config.ts",
  "tests/e2e/playwright/d0/golden.spec.ts",
  "--project=chromium",
  "--repeat-each=3",
  "--workers=1",
  "--reporter=json",
];

export const summarizePlaywrightReport = (
  stdout: string,
): D0WebGoldenSummary => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return notVerified("Playwright did not emit one JSON report");
  }
  if (typeof parsed !== "object" || parsed === null)
    return notVerified("Playwright report must be an object");
  const report = parsed as Record<string, unknown>;
  if (!Array.isArray(report.errors) || report.errors.length !== 0)
    return notVerified("Playwright reported runner errors");
  if (typeof report.stats !== "object" || report.stats === null)
    return notVerified("Playwright report omitted stats");
  const stats = report.stats as Record<string, unknown>;
  for (const field of ["expected", "flaky", "skipped", "unexpected"] as const) {
    if (!nonNegativeInteger(stats[field]))
      return notVerified(`Playwright stats.${field} is invalid`);
  }
  const normalized = stats as unknown as PlaywrightStats;
  if (
    normalized.expected !== 3 ||
    normalized.flaky !== 0 ||
    normalized.skipped !== 0 ||
    normalized.unexpected !== 0
  )
    return notVerified(
      `expected=${normalized.expected} unexpected=${normalized.unexpected} flaky=${normalized.flaky} skipped=${normalized.skipped}`,
    );
  return { failed: 0, passed: normalized.expected, skipped: 0 };
};

export interface D0WebGoldenDependencies {
  execute: () => Promise<
    Readonly<{ exitCode: number; stderr: string; stdout: string }>
  >;
}

const defaultExecute = async (): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> => {
  const environment: NodeJS.ProcessEnv = {
    CI: "true",
    HOME: "/var/empty",
    HUOQIU_D0_WEB_SERVER_EXTERNAL: "1",
    LANG: "C",
    LC_ALL: "C",
    NODE_PATH: resolve(repositoryRoot, "node_modules/.pnpm/node_modules"),
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    TMPDIR: "/tmp",
    TZ: "UTC",
  };
  const build = await new Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }>((resolvePromise) => {
    execFile(
      process.execPath,
      [nextCli, "build"],
      {
        cwd: webRoot,
        env: environment,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      },
      (error, stdout, stderr) => {
        const processError = error as NodeJS.ErrnoException | null;
        resolvePromise({
          exitCode:
            processError === null
              ? 0
              : typeof processError.code === "number"
                ? processError.code
                : 1,
          stderr,
          stdout,
        });
      },
    );
  });
  if (build.exitCode !== 0) return build;

  const server = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3310"],
    {
      cwd: webRoot,
      detached: process.platform !== "win32",
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let serverOutput = "";
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk: string) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk: string) => {
    serverOutput += chunk;
  });
  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await fetch("http://127.0.0.1:3310", {
        signal: AbortSignal.timeout(1_000),
      })
        .then((response) => response.ok)
        .catch(() => false);
      if (ready) break;
      await new Promise<void>((resolvePromise) =>
        setTimeout(resolvePromise, 100),
      );
    }
    if (!ready)
      return {
        exitCode: 1,
        stderr: `Next production server did not become ready: ${serverOutput}`,
        stdout: "",
      };

    // Keep the workspace-facing symlink path. Resolving into pnpm's virtual
    // store changes Playwright's loader ancestry and makes workspace packages
    // unreachable from root-level E2E fixtures.
    const playwrightCli = resolve(
      repositoryRoot,
      "node_modules/@playwright/test/cli.js",
    );
    return await new Promise((resolvePromise) => {
      execFile(
        process.execPath,
        [playwrightCli, ...playwrightArguments()],
        {
          cwd: repositoryRoot,
          env: environment,
          maxBuffer: 20 * 1024 * 1024,
          timeout: 20 * 60 * 1000,
        },
        (error, stdout, stderr) => {
          const processError = error as NodeJS.ErrnoException | null;
          resolvePromise({
            exitCode:
              processError === null
                ? 0
                : typeof processError.code === "number"
                  ? processError.code
                  : 1,
            stderr,
            stdout,
          });
        },
      );
    });
  } finally {
    if (server.pid !== undefined) {
      try {
        process.kill(
          process.platform === "win32" ? server.pid : -server.pid,
          "SIGKILL",
        );
      } catch {
        // The production server may have already exited after a runner error.
      }
    }
  }
};

export const runWebD0GoldenEvidence = async (
  dependencies: D0WebGoldenDependencies = { execute: defaultExecute },
): Promise<D0WebGoldenSummary> => {
  const execution = await dependencies.execute();
  if (execution.exitCode !== 0)
    return notVerified(
      `Playwright exit_code=${execution.exitCode}; stderr=${execution.stderr.trim()}; stdout=${execution.stdout.trim().slice(0, 10_000)}`,
    );
  if (execution.stderr.trim().length !== 0)
    return notVerified("Playwright emitted stderr");
  return summarizePlaywrightReport(execution.stdout);
};

export const main = async (): Promise<void> => {
  const summary = await runWebD0GoldenEvidence();
  process.stdout.write(
    `D0_WEB VERIFIED runs=${summary.passed} failed=0 skipped=0\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
