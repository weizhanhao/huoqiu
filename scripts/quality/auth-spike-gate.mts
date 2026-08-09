import { execFile as execFileCallback } from "node:child_process";
import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  isMainModule,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);

const selectedProvider = "better-auth";
const expectedCandidatePackages = {
  "better-auth": "1.6.26",
  "@thallesp/nestjs-better-auth": "2.7.0",
} as const;

interface CandidatePackageMetadata {
  name: string;
  version: string;
  license: string;
}

interface AuditFinding {
  paths?: unknown;
}

interface AuditAdvisory {
  findings?: unknown;
  github_advisory_id?: unknown;
  module_name?: unknown;
  severity?: unknown;
}

interface AuditProcessFailure {
  message: string;
  stderr?: string | undefined;
  stdout?: string | undefined;
}

interface VitestJsonReport {
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numTotalTests: number;
  success: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export const assertNodeRuntime = (
  runtime: string,
  declaredEngine: unknown,
  declaredNvmVersion: string,
): void => {
  if (
    declaredEngine !== ">=24.15.0 <25" ||
    declaredNvmVersion.trim() !== "24.15.0"
  ) {
    throw new QualityGateError(
      "AUTH_NODE_DECLARATION_MISMATCH",
      "package.json engines.node and .nvmrc must declare >=24.15.0 <25 and 24.15.0",
    );
  }
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(runtime);
  if (match === null) {
    throw new QualityGateError(
      "AUTH_NODE_RUNTIME_UNSUPPORTED",
      `${runtime}; required >=24.15.0 <25`,
    );
  }
  const [, rawMajor, rawMinor] = match;
  const major = Number(rawMajor);
  const minor = Number(rawMinor);
  if (major !== 24 || minor < 15) {
    throw new QualityGateError(
      "AUTH_NODE_RUNTIME_UNSUPPORTED",
      `${runtime}; required >=24.15.0 <25`,
    );
  }
};

export const assertPassingVitestReport = (
  stdout: string,
  scope: "root" | "mobile",
): void => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new QualityGateError(
      "AUTH_VITEST_REPORT_INVALID",
      `${scope} Vitest did not emit one JSON report`,
    );
  }
  if (!isRecord(parsed)) {
    throw new QualityGateError(
      "AUTH_VITEST_REPORT_INVALID",
      `${scope} Vitest report must be an object`,
    );
  }
  for (const field of [
    "numFailedTests",
    "numPassedTests",
    "numPendingTests",
    "numTodoTests",
    "numTotalTests",
  ] as const) {
    if (!isNonNegativeSafeInteger(parsed[field])) {
      throw new QualityGateError(
        "AUTH_VITEST_REPORT_INVALID",
        `${scope} Vitest ${field} must be a non-negative safe integer`,
      );
    }
  }
  if (typeof parsed.success !== "boolean") {
    throw new QualityGateError(
      "AUTH_VITEST_REPORT_INVALID",
      `${scope} Vitest success must be boolean`,
    );
  }
  const report = parsed as unknown as VitestJsonReport;
  if (
    !report.success ||
    report.numTotalTests === 0 ||
    report.numPassedTests !== report.numTotalTests ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0
  ) {
    throw new QualityGateError(
      "AUTH_TESTS_NOT_ALL_PASSED",
      `${scope} total=${report.numTotalTests} passed=${report.numPassedTests} failed=${report.numFailedTests} pending=${report.numPendingTests} todo=${report.numTodoTests}`,
    );
  }
};

export const assertSelectedProvider = (provider: string): void => {
  if (provider !== selectedProvider) {
    throw new QualityGateError(
      "AUTH_PROVIDER_NOT_SELECTED",
      `${provider}; accepted provider is ${selectedProvider}`,
    );
  }
};

export const assertCandidatePackageMetadata = (
  packages: readonly CandidatePackageMetadata[],
): void => {
  const byName = new Map(packages.map((item) => [item.name, item]));
  for (const [name, version] of Object.entries(expectedCandidatePackages)) {
    const candidate = byName.get(name);
    if (
      candidate?.version !== version ||
      candidate.license.toUpperCase() !== "MIT"
    ) {
      throw new QualityGateError(
        "AUTH_CANDIDATE_METADATA_MISMATCH",
        `${name} must be ${version} under MIT`,
      );
    }
  }
  if (byName.size !== Object.keys(expectedCandidatePackages).length) {
    throw new QualityGateError(
      "AUTH_CANDIDATE_METADATA_MISMATCH",
      "candidate metadata contains an unexpected package",
    );
  }
};

export const rootHighOrCriticalAdvisories = (report: unknown): string[] => {
  if (!isRecord(report) || !isRecord(report.advisories)) {
    throw new QualityGateError(
      "AUTH_AUDIT_INVALID",
      "pnpm audit did not return an advisories object",
    );
  }

  const findings: string[] = [];
  for (const advisoryValue of Object.values(report.advisories)) {
    if (!isRecord(advisoryValue)) continue;
    const advisory = advisoryValue as AuditAdvisory;
    if (advisory.severity !== "high" && advisory.severity !== "critical") {
      continue;
    }
    if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
      throw new QualityGateError(
        "AUTH_AUDIT_INVALID",
        "High/Critical advisory findings must be a non-empty array",
      );
    }
    let reachesRoot = false;
    for (const findingValue of advisory.findings) {
      if (!isRecord(findingValue)) {
        throw new QualityGateError(
          "AUTH_AUDIT_INVALID",
          "High/Critical advisory finding must be an object",
        );
      }
      const finding = findingValue as AuditFinding;
      if (
        !Array.isArray(finding.paths) ||
        finding.paths.length === 0 ||
        finding.paths.some((path) => typeof path !== "string")
      ) {
        throw new QualityGateError(
          "AUTH_AUDIT_INVALID",
          "High/Critical advisory paths must be a non-empty string array",
        );
      }
      reachesRoot ||= finding.paths.some((path) => path.startsWith(".>"));
    }
    if (!reachesRoot) continue;
    const id =
      typeof advisory.github_advisory_id === "string"
        ? advisory.github_advisory_id
        : "UNKNOWN_ADVISORY";
    const moduleName =
      typeof advisory.module_name === "string"
        ? advisory.module_name
        : "unknown-module";
    findings.push(`${id}:${moduleName}:${advisory.severity}`);
  }
  return findings.sort();
};

export const auditOutputFromFailure = (
  failure: AuditProcessFailure,
): string => {
  if (failure.stdout?.trim().startsWith("{")) return failure.stdout;
  throw new QualityGateError(
    "AUTH_AUDIT_UNAVAILABLE",
    (failure.stderr || failure.message).trim().slice(0, 2_000),
  );
};

const readJson = async (path: string): Promise<Record<string, unknown>> => {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value)) {
    throw new QualityGateError("AUTH_METADATA_INVALID", `${path} is invalid`);
  }
  return value;
};

const assertDeclaredVersions = async (): Promise<void> => {
  const rootPackage = await readJson(resolve(repositoryRoot, "package.json"));
  const spikePackage = await readJson(
    resolve(repositoryRoot, "spikes/auth/package.json"),
  );
  const rootDependencies = rootPackage.devDependencies;
  const spikeDependencies = spikePackage.dependencies;
  if (!isRecord(rootDependencies) || !isRecord(spikeDependencies)) {
    throw new QualityGateError(
      "AUTH_METADATA_INVALID",
      "candidate dependency declarations are missing",
    );
  }
  for (const [name, version] of Object.entries(expectedCandidatePackages)) {
    if (
      rootDependencies[name] !== version ||
      spikeDependencies[name] !== version
    ) {
      throw new QualityGateError(
        "AUTH_CANDIDATE_VERSION_DRIFT",
        `${name} must be pinned to ${version}`,
      );
    }
  }
};

const assertConfiguredNodeRuntime = async (): Promise<void> => {
  const rootPackage = await readJson(resolve(repositoryRoot, "package.json"));
  const engines = rootPackage.engines;
  const nvmVersion = await readFile(resolve(repositoryRoot, ".nvmrc"), "utf8");
  assertNodeRuntime(
    process.version,
    isRecord(engines) ? engines.node : undefined,
    nvmVersion,
  );
};

const installedPackageMetadata = async (
  name: keyof typeof expectedCandidatePackages,
): Promise<CandidatePackageMetadata> => {
  let current = dirname(require.resolve(name));
  while (true) {
    const packagePath = resolve(current, "package.json");
    try {
      const manifest = await readJson(packagePath);
      if (manifest.name === name) {
        if (
          typeof manifest.version !== "string" ||
          typeof manifest.license !== "string"
        ) {
          throw new QualityGateError(
            "AUTH_METADATA_INVALID",
            `${name} package metadata is incomplete`,
          );
        }
        return {
          name,
          version: manifest.version,
          license: manifest.license,
        };
      }
    } catch (error) {
      if (error instanceof QualityGateError) throw error;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new QualityGateError(
        "AUTH_METADATA_INVALID",
        `cannot resolve installed package metadata for ${name}`,
      );
    }
    current = parent;
  }
};

const runCommand = async (
  command: string,
  args: string[],
  code: string,
): Promise<string> => {
  try {
    const result = await execFile(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, CI: "true" },
      maxBuffer: 4 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string };
    const detail = (failure.stderr || failure.stdout || failure.message).trim();
    throw new QualityGateError(code, detail.slice(0, 2_000));
  }
};

const pnpmCommand = (): { command: string; prefix: string[] } => {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return { command: process.execPath, prefix: [npmExecPath] };
  }
  return { command: "pnpm", prefix: [] };
};

const verifyAudit = async (): Promise<void> => {
  const pnpm = pnpmCommand();
  const args = [
    ...pnpm.prefix,
    "audit",
    "--dev",
    "--registry=https://registry.npmjs.org",
    "--audit-level",
    "high",
    "--json",
  ];
  let output: string;
  try {
    const result = await execFile(pnpm.command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, CI: "true" },
      maxBuffer: 4 * 1024 * 1024,
    });
    output = result.stdout;
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string };
    output = auditOutputFromFailure({
      message: failure.message,
      stderr: failure.stderr,
      stdout: failure.stdout,
    });
  }
  let report: unknown;
  try {
    report = JSON.parse(output);
  } catch {
    throw new QualityGateError(
      "AUTH_AUDIT_INVALID",
      "pnpm audit output is not JSON",
    );
  }
  const advisories = rootHighOrCriticalAdvisories(report);
  if (advisories.length > 0) {
    throw new QualityGateError(
      "AUTH_AUDIT_HIGH_OR_CRITICAL",
      advisories.join(","),
    );
  }
};

const verifyRootConformance = async (): Promise<void> => {
  const typescriptCli = resolve(
    repositoryRoot,
    "node_modules/typescript/bin/tsc",
  );
  await runCommand(
    process.execPath,
    [typescriptCli, "--noEmit", "-p", "spikes/auth/tsconfig.json"],
    "AUTH_ROOT_TYPECHECK_FAILED",
  );
  const vitestCli = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs");
  const report = await runCommand(
    process.execPath,
    [
      vitestCli,
      "run",
      "spikes/auth/test/auth-provider.conformance.spec.ts",
      "--no-file-parallelism",
      "--reporter=json",
    ],
    "AUTH_ROOT_CONFORMANCE_FAILED",
  );
  assertPassingVitestReport(report, "root");
};

const verifyMobileEvidence = async (): Promise<void> => {
  const testPath = resolve(
    repositoryRoot,
    "apps/mobile/tests/auth/secure-session-spike.spec.ts",
  );
  try {
    await access(testPath);
  } catch {
    throw new QualityGateError(
      "AUTH_MOBILE_EVIDENCE_MISSING",
      "apps/mobile/tests/auth/secure-session-spike.spec.ts is required",
    );
  }
  const pnpm = pnpmCommand();
  const report = await runCommand(
    pnpm.command,
    [
      ...pnpm.prefix,
      "--filter",
      "@huoqiu/mobile",
      "exec",
      "vitest",
      "run",
      "tests/auth/secure-session-spike.spec.ts",
      "--no-file-parallelism",
      "--reporter=json",
    ],
    "AUTH_MOBILE_CONFORMANCE_FAILED",
  );
  assertPassingVitestReport(report, "mobile");
};

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  await assertConfiguredNodeRuntime();
  const flags = parseStrictFlags(args, new Set(["--provider"]));
  const provider = requiredFlag(flags, "--provider");
  assertSelectedProvider(provider);
  await assertDeclaredVersions();
  assertCandidatePackageMetadata(
    await Promise.all(
      Object.keys(expectedCandidatePackages).map(
        async (name) =>
          await installedPackageMetadata(
            name as keyof typeof expectedCandidatePackages,
          ),
      ),
    ),
  );
  await verifyRootConformance();
  await verifyAudit();
  await verifyMobileEvidence();
  process.stdout.write(
    "AUTH_SPIKE VERIFIED provider=better-auth root=passed audit=passed mobile=passed\n",
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
