import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMainModule,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

export type MobileD0Platform = "android" | "ios";

export interface CommandRequest {
  args: string[];
  cwd: string;
  executable: string;
  label: string;
  timeoutMs?: number;
}

export interface CommandResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

interface Snapshot {
  cleanup: () => Promise<void>;
  root: string;
}

export interface MobileD0EvidenceDependencies {
  artifactDirectory: (commit: string, platform: MobileD0Platform) => string;
  createSnapshot: (commit: string) => Promise<Snapshot>;
  now: () => Date;
  output: (line: string) => void;
  repositoryRoot: string;
  runCommand: (request: CommandRequest) => Promise<CommandResult>;
  writeArtifact: (
    directory: string,
    name: string,
    contents: string,
  ) => Promise<void>;
}

interface MobileTarget {
  id: string;
  state?: string;
}

interface RecordedCommand {
  args: string[];
  cwd: string;
  executable: string;
  exit_code: number;
  label: string;
  signal: NodeJS.Signals | null;
}

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

const parsePlatform = (args: string[]): MobileD0Platform => {
  const flags = parseStrictFlags(args, new Set(["--platform"]));
  const platform = requiredFlag(flags, "--platform");
  if (platform !== "ios" && platform !== "android")
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "--platform must be ios or android",
    );
  return platform;
};

const normalizedReason = (value: string): string => {
  const line = value
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  const normalized = (line ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 160);
  return normalized.length === 0 ? "unknown" : normalized;
};

const commandLog = (
  request: CommandRequest,
  commandResult: CommandResult,
): string =>
  [
    JSON.stringify({
      args: request.args,
      cwd: request.cwd,
      executable: request.executable,
      exit_code: commandResult.exitCode,
      label: request.label,
      signal: commandResult.signal,
    }),
    "--- stdout ---",
    commandResult.stdout,
    "--- stderr ---",
    commandResult.stderr,
  ].join("\n") + "\n";

const iosTarget = (stdout: string): MobileTarget | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("devices" in parsed) ||
    typeof parsed.devices !== "object" ||
    parsed.devices === null
  )
    return undefined;
  const targets = Object.values(parsed.devices as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter(
      (value): value is Record<string, unknown> =>
        typeof value === "object" &&
        value !== null &&
        value.isAvailable === true &&
        typeof value.udid === "string" &&
        value.udid.length > 0,
    )
    .map((value) => ({
      id: value.udid as string,
      ...(typeof value.state === "string" ? { state: value.state } : {}),
    }));
  return targets.find(({ state }) => state === "Booted") ?? targets[0];
};

const androidTarget = (stdout: string): MobileTarget | undefined => {
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^(\S+)\s+device$/u.exec(line.trim());
    if (match?.[1] !== undefined) return { id: match[1] };
  }
  return undefined;
};

const pnpmExecutable = (): string =>
  process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const defaultRunCommand = async (
  request: CommandRequest,
): Promise<CommandResult> =>
  await new Promise((resolvePromise) => {
    execFile(
      request.executable,
      request.args,
      {
        cwd: request.cwd,
        env: { ...process.env, CI: "1" },
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const processError = error as
          | (NodeJS.ErrnoException & {
              signal?: NodeJS.Signals | null;
            })
          | null;
        resolvePromise({
          exitCode:
            processError === null
              ? 0
              : typeof processError.code === "number"
                ? processError.code
                : 1,
          signal: processError?.signal ?? null,
          stderr,
          stdout,
        });
      },
    );
  });

const createSnapshot = async (commit: string): Promise<Snapshot> => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "huoqiu-d0-mobile-"));
  const archivePath = join(temporaryRoot, "source.tar");
  const snapshotRoot = join(temporaryRoot, "source");
  await mkdir(snapshotRoot, { recursive: true });
  const archive = await defaultRunCommand({
    args: ["archive", "--format=tar", `--output=${archivePath}`, commit],
    cwd: repositoryRoot,
    executable: "git",
    label: "snapshot-archive",
  });
  if (archive.exitCode !== 0) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw new QualityGateError(
      "D0_MOBILE_SNAPSHOT_FAILED",
      normalizedReason(archive.stderr),
    );
  }
  const extract = await defaultRunCommand({
    args: ["-xf", archivePath, "-C", snapshotRoot],
    cwd: temporaryRoot,
    executable: "tar",
    label: "snapshot-extract",
  });
  if (extract.exitCode !== 0) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw new QualityGateError(
      "D0_MOBILE_SNAPSHOT_FAILED",
      normalizedReason(extract.stderr),
    );
  }
  return {
    cleanup: async () =>
      await rm(temporaryRoot, { force: true, recursive: true }),
    root: snapshotRoot,
  };
};

const defaultDependencies: MobileD0EvidenceDependencies = {
  artifactDirectory: (commit, platform) =>
    join(
      repositoryRoot,
      "artifacts",
      "evidence",
      commit,
      "mobile-d0",
      platform,
    ),
  createSnapshot,
  now: () => new Date(),
  output: (line) => process.stdout.write(`${line}\n`),
  repositoryRoot,
  runCommand: defaultRunCommand,
  writeArtifact: async (directory, name, contents) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), contents, "utf8");
  },
};

export const runMobileD0Evidence = async (
  args: string[],
  dependencies: MobileD0EvidenceDependencies = defaultDependencies,
): Promise<void> => {
  const platform = parsePlatform(args);
  const records: RecordedCommand[] = [];

  const run = async (
    request: CommandRequest,
    artifactDirectory?: string,
  ): Promise<CommandResult> => {
    const commandResult = await dependencies.runCommand(request);
    records.push({
      args: request.args,
      cwd: request.cwd,
      executable: request.executable,
      exit_code: commandResult.exitCode,
      label: request.label,
      signal: commandResult.signal,
    });
    if (artifactDirectory !== undefined)
      await dependencies.writeArtifact(
        artifactDirectory,
        `${request.label}.log`,
        commandLog(request, commandResult),
      );
    return commandResult;
  };

  const head = await run({
    args: ["rev-parse", "HEAD"],
    cwd: dependencies.repositoryRoot,
    executable: "git",
    label: "git-head",
  });
  const commit = head.stdout.trim();
  if (head.exitCode !== 0 || !SHA_PATTERN.test(commit))
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "cannot resolve an exact HEAD commit",
    );
  const status = await run({
    args: ["status", "--porcelain"],
    cwd: dependencies.repositoryRoot,
    executable: "git",
    label: "git-status",
  });
  if (status.exitCode !== 0 || status.stdout.trim().length > 0)
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "evidence requires a clean worktree",
    );

  const artifactDirectory = dependencies.artifactDirectory(commit, platform);
  let target: MobileTarget | undefined;
  let reason: string | undefined;

  if (platform === "ios") {
    const probe = await run(
      {
        args: ["simctl", "list", "devices", "available", "--json"],
        cwd: dependencies.repositoryRoot,
        executable: "xcrun",
        label: "ios-probe",
      },
      artifactDirectory,
    );
    if (probe.exitCode !== 0)
      reason = `ios_xcrun_unavailable:${normalizedReason(probe.stderr)}`;
    else {
      target = iosTarget(probe.stdout);
      if (target === undefined) reason = "ios_no_available_simulator";
    }
  } else {
    const probe = await run(
      {
        args: ["devices"],
        cwd: dependencies.repositoryRoot,
        executable: "adb",
        label: "android-probe",
      },
      artifactDirectory,
    );
    if (probe.exitCode !== 0)
      reason = `android_adb_unavailable:${normalizedReason(probe.stderr)}`;
    else {
      target = androidTarget(probe.stdout);
      if (target === undefined) reason = "android_no_connected_device";
    }
  }

  if (target !== undefined) {
    const maestroProbe = await run(
      {
        args: ["--version"],
        cwd: dependencies.repositoryRoot,
        executable: "maestro",
        label: "maestro-probe",
      },
      artifactDirectory,
    );
    if (maestroProbe.exitCode !== 0)
      reason = `maestro_unavailable:${normalizedReason(maestroProbe.stderr)}`;
  }

  let snapshot: Snapshot;
  try {
    snapshot = await dependencies.createSnapshot(commit);
  } catch (error) {
    const snapshotReason =
      error instanceof Error ? normalizedReason(error.message) : "unknown";
    reason ??= `snapshot_creation_failed:${snapshotReason}`;
    const summary = {
      schema_version: 1,
      commit_sha: commit,
      flow_count: 0,
      generated_at: dependencies.now().toISOString(),
      platform,
      reason,
      verified: false,
      commands: records,
    };
    await dependencies.writeArtifact(
      artifactDirectory,
      "summary.json",
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    dependencies.output(
      `D0_MOBILE NOT_VERIFIED platform=${platform} reason=${reason}`,
    );
    throw new QualityGateError("D0_MOBILE_NOT_VERIFIED", reason);
  }

  const finishNotVerified = async (
    notVerifiedReason: string,
  ): Promise<never> => {
    const summary = {
      schema_version: 1,
      commit_sha: commit,
      flow_count: 0,
      generated_at: dependencies.now().toISOString(),
      platform,
      reason: notVerifiedReason,
      verified: false,
      commands: records,
    };
    await dependencies.writeArtifact(
      artifactDirectory,
      "summary.json",
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    dependencies.output(
      `D0_MOBILE NOT_VERIFIED platform=${platform} reason=${notVerifiedReason}`,
    );
    throw new QualityGateError("D0_MOBILE_NOT_VERIFIED", notVerifiedReason);
  };

  try {
    const install = await run(
      {
        args: ["install", "--frozen-lockfile", "--offline"],
        cwd: snapshot.root,
        executable: pnpmExecutable(),
        label: "snapshot-install",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
      artifactDirectory,
    );
    const exportResult = await run(
      {
        args: [
          "--filter",
          "@huoqiu/mobile",
          "exec",
          "expo",
          "export",
          "--platform",
          "web",
          "--output-dir",
          join(snapshot.root, ".d0-evidence", "expo-web"),
        ],
        cwd: snapshot.root,
        executable: pnpmExecutable(),
        label: "expo-export",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
      artifactDirectory,
    );
    const prebuild = await run(
      {
        args: [
          "--filter",
          "@huoqiu/mobile",
          "exec",
          "expo",
          "prebuild",
          "--no-install",
          "--platform",
          platform,
        ],
        cwd: snapshot.root,
        executable: pnpmExecutable(),
        label: "expo-prebuild",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
      artifactDirectory,
    );

    if (reason !== undefined) return await finishNotVerified(reason);
    if (install.exitCode !== 0)
      return await finishNotVerified("snapshot_install_failed");
    if (exportResult.exitCode !== 0)
      return await finishNotVerified("expo_export_failed");
    if (prebuild.exitCode !== 0)
      return await finishNotVerified("expo_prebuild_failed");
    if (target === undefined)
      return await finishNotVerified(`${platform}_target_unavailable`);

    if (platform === "ios" && target.state !== "Booted") {
      const boot = await run(
        {
          args: ["simctl", "boot", target.id],
          cwd: snapshot.root,
          executable: "xcrun",
          label: "ios-boot",
        },
        artifactDirectory,
      );
      if (boot.exitCode !== 0)
        return await finishNotVerified("ios_simulator_boot_failed");
      const bootStatus = await run(
        {
          args: ["simctl", "bootstatus", target.id, "-b"],
          cwd: snapshot.root,
          executable: "xcrun",
          label: "ios-boot-status",
          timeoutMs: BUILD_TIMEOUT_MS,
        },
        artifactDirectory,
      );
      if (bootStatus.exitCode !== 0)
        return await finishNotVerified("ios_simulator_boot_status_failed");
    }

    const launch = await run(
      {
        args: [
          "--filter",
          "@huoqiu/mobile",
          "exec",
          "expo",
          `run:${platform}`,
          "--no-install",
          "--device",
          target.id,
        ],
        cwd: snapshot.root,
        executable: pnpmExecutable(),
        label: "app-launch",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
      artifactDirectory,
    );
    if (launch.exitCode !== 0)
      return await finishNotVerified(`${platform}_build_or_launch_failed`);

    const flow = await run(
      {
        args: [
          "--device",
          target.id,
          "test",
          "tests/e2e/maestro/d0/golden.yaml",
        ],
        cwd: snapshot.root,
        executable: "maestro",
        label: "maestro-flow",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
      artifactDirectory,
    );
    if (flow.exitCode !== 0)
      return await finishNotVerified("maestro_flow_failed");
    if (!/\b1\s+Flow Passed\b/u.test(`${flow.stdout}\n${flow.stderr}`))
      return await finishNotVerified("maestro_flow_result_missing");

    const summary = {
      schema_version: 1,
      commit_sha: commit,
      flow_count: 1,
      generated_at: dependencies.now().toISOString(),
      platform,
      reason: null,
      verified: true,
      commands: records,
    };
    await dependencies.writeArtifact(
      artifactDirectory,
      "summary.json",
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    dependencies.output(
      `D0_MOBILE VERIFIED platform=${platform} commit=${commit} flows=1`,
    );
  } finally {
    await snapshot.cleanup();
  }
};

export const main = async (args = process.argv.slice(2)): Promise<void> =>
  await runMobileD0Evidence(args);

if (isMainModule(import.meta.url)) await runCli(main);
