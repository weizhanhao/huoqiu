import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMainModule,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

export type MobileD0Platform = "android" | "ios";
type ToolName = "adb" | "git" | "maestro" | "node" | "pnpm" | "tar" | "xcrun";

export interface CommandRequest {
  args: string[];
  cwd: string;
  executable: string;
  label: string;
  timeoutMs?: number;
}

export interface CommandResult {
  errorMessage?: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

interface Snapshot {
  archivePath: string;
  cleanup: () => Promise<void>;
  root: string;
  temporaryRoot: string;
}

export interface ToolIdentity {
  components: ToolComponentIdentity[];
  executable: string;
  prefixArgs: string[];
  realpath: string;
  sha256: string;
  version?: string;
}

export interface ToolComponentIdentity {
  mode: number;
  path: string;
  realpath: string;
  sha256: string;
  uid: number;
}

type ToolSet = Partial<Record<ToolName, ToolIdentity>>;

export interface MobileD0EvidenceDependencies {
  artifactDirectory: (commit: string, platform: MobileD0Platform) => string;
  createSnapshot: () => Promise<Snapshot>;
  discoverCommit: () => Promise<string>;
  ensureArtifactDirectory: (directory: string) => Promise<void>;
  now: () => Date;
  output: (line: string) => void;
  repositoryRoot: string;
  resolveTools: (platform: MobileD0Platform) => Promise<ToolSet>;
  runCommand: (request: CommandRequest) => Promise<CommandResult>;
  verifyToolIdentity: (identity: ToolIdentity) => Promise<boolean>;
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
  error_message?: string;
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
const ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCodePoint(27)}\\[[0-9;]*m`,
  "gu",
);

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
      ...(commandResult.errorMessage === undefined
        ? {}
        : { error_message: commandResult.errorMessage }),
      exit_code: commandResult.exitCode,
      label: request.label,
      signal: commandResult.signal,
    }),
    "--- stdout ---",
    commandResult.stdout,
    "--- stderr ---",
    commandResult.stderr,
  ].join("\n") + "\n";

const commandFailureReason = (commandResult: CommandResult): string =>
  normalizedReason(
    commandResult.stderr ||
      commandResult.errorMessage ||
      commandResult.stdout ||
      "unknown",
  );

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

const safeEnvironment = (): NodeJS.ProcessEnv => {
  return {
    CI: "1",
    HOME: "/var/empty",
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    TMPDIR: "/tmp",
  };
};

const defaultRunCommand = async (
  request: CommandRequest,
): Promise<CommandResult> =>
  await new Promise((resolvePromise) => {
    execFile(
      request.executable,
      request.args,
      {
        cwd: request.cwd,
        env: safeEnvironment(),
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const processError = error as
          (NodeJS.ErrnoException & { signal?: NodeJS.Signals | null }) | null;
        resolvePromise({
          ...(processError?.message === undefined
            ? {}
            : { errorMessage: processError.message }),
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

const gitDirectory = async (root: string): Promise<string> => {
  const marker = join(root, ".git");
  const markerStat = await stat(marker);
  if (markerStat.isDirectory()) return marker;
  const contents = await readFile(marker, "utf8");
  const match = /^gitdir:\s*(.+)\s*$/u.exec(contents);
  if (match?.[1] === undefined)
    throw new QualityGateError("D0_MOBILE_CONTEXT_INVALID", "invalid .git");
  return resolve(root, match[1]);
};

const discoverCommit = async (): Promise<string> => {
  const directory = await gitDirectory(repositoryRoot);
  const head = (await readFile(join(directory, "HEAD"), "utf8")).trim();
  if (SHA_PATTERN.test(head)) return head;
  const reference = /^ref:\s*(.+)$/u.exec(head)?.[1];
  if (reference === undefined)
    throw new QualityGateError("D0_MOBILE_CONTEXT_INVALID", "invalid HEAD");
  try {
    return (await readFile(join(directory, reference), "utf8")).trim();
  } catch {
    let commonDirectory = directory;
    try {
      commonDirectory = resolve(
        directory,
        (await readFile(join(directory, "commondir"), "utf8")).trim(),
      );
    } catch {
      // A main worktree keeps refs in its own .git directory.
    }
    try {
      return (await readFile(join(commonDirectory, reference), "utf8")).trim();
    } catch {
      const packed = await readFile(
        join(commonDirectory, "packed-refs"),
        "utf8",
      );
      return (
        packed
          .split(/\r?\n/u)
          .map((line) => line.split(" "))
          .find((parts) => parts[1] === reference)?.[0] ?? ""
      );
    }
  }
};

export const trustedToolCandidates = (
  platform: MobileD0Platform,
): Readonly<Record<ToolName, readonly string[]>> => {
  void platform;
  return {
    adb: [],
    git: ["/usr/bin/git"],
    maestro: [],
    node: [process.execPath],
    pnpm: [],
    tar: ["/usr/bin/tar"],
    xcrun: ["/usr/bin/xcrun"],
  };
};

const hasRootOwnedImmutableChain = async (path: string): Promise<boolean> => {
  let cursor = path;
  const filesystemRoot = parse(path).root;
  while (true) {
    const metadata = await stat(cursor);
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) return false;
    if (cursor === filesystemRoot) return true;
    cursor = dirname(cursor);
  }
};

const componentIdentity = async (
  candidate: string,
): Promise<ToolComponentIdentity | undefined> => {
  if (!isAbsolute(candidate)) return undefined;
  try {
    const canonicalPath = await realpath(candidate);
    const metadata = await stat(canonicalPath);
    if (
      !metadata.isFile() ||
      !(await hasRootOwnedImmutableChain(canonicalPath))
    )
      return undefined;
    return {
      mode: metadata.mode,
      path: candidate,
      realpath: canonicalPath,
      sha256: createHash("sha256")
        .update(await readFile(canonicalPath))
        .digest("hex"),
      uid: metadata.uid,
    };
  } catch {
    return undefined;
  }
};

const resolveTool = async (
  candidates: readonly string[],
): Promise<ToolIdentity | undefined> => {
  for (const candidate of candidates) {
    const component = await componentIdentity(candidate);
    if (component === undefined) continue;
    return {
      components: [component],
      executable: component.realpath,
      prefixArgs: [],
      realpath: component.realpath,
      sha256: component.sha256,
    };
  }
  return undefined;
};

const verifyToolIdentity = async (identity: ToolIdentity): Promise<boolean> => {
  if (identity.components.length === 0) return false;
  for (const expected of identity.components) {
    const current = await componentIdentity(expected.path);
    if (
      current === undefined ||
      current.realpath !== expected.realpath ||
      current.sha256 !== expected.sha256 ||
      current.uid !== expected.uid ||
      current.mode !== expected.mode
    )
      return false;
  }
  const launcher = identity.components[0];
  return launcher !== undefined && identity.executable === launcher.realpath;
};

const resolveTools = async (platform: MobileD0Platform): Promise<ToolSet> => {
  const candidates = trustedToolCandidates(platform);
  const names: ToolName[] = [
    "git",
    "tar",
    "node",
    "pnpm",
    platform === "ios" ? "xcrun" : "adb",
    "maestro",
  ];
  const entries = await Promise.all(
    names.map(
      async (name) => [name, await resolveTool(candidates[name])] as const,
    ),
  );
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [ToolName, ToolIdentity] =>
        entry[1] !== undefined,
    ),
  );
};

const createSnapshot = async (): Promise<Snapshot> => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "huoqiu-d0-mobile-"));
  const root = join(temporaryRoot, "source");
  await mkdir(root, { recursive: true });
  return {
    archivePath: join(temporaryRoot, "source.tar"),
    cleanup: async () =>
      await rm(temporaryRoot, { force: true, recursive: true }),
    root,
    temporaryRoot,
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
  discoverCommit,
  ensureArtifactDirectory: async (directory) => {
    await mkdir(directory, { recursive: true });
  },
  now: () => new Date(),
  output: (line) => process.stdout.write(`${line}\n`),
  repositoryRoot,
  resolveTools,
  runCommand: defaultRunCommand,
  verifyToolIdentity,
  writeArtifact: async (directory, name, contents) =>
    await writeFile(join(directory, name), contents, "utf8"),
};

const versionContract = (
  name: ToolName,
): Readonly<{ args: string[]; pattern: RegExp }> => {
  switch (name) {
    case "git":
      return { args: ["--version"], pattern: /^git version \d+\.\d+/iu };
    case "tar":
      return { args: ["--version"], pattern: /\b(?:bsdtar|tar)\b.*\d+/iu };
    case "pnpm":
      return { args: ["--version"], pattern: /^11\.4\.0\s*$/u };
    case "node":
      return { args: ["--version"], pattern: /^v24\.15\.\d+\s*$/u };
    case "xcrun":
      return { args: ["--version"], pattern: /^xcrun version \d+/iu };
    case "adb":
      return { args: ["version"], pattern: /Android Debug Bridge version/iu };
    case "maestro":
      return { args: ["--version"], pattern: /^\d+\.\d+\.\d+/u };
  }
};

const maestroTotals = (
  output: string,
):
  Readonly<{ failed: number; passed: number; skipped: number }> | undefined => {
  const totals = { failed: 0, passed: 0, skipped: 0 };
  let passedSummaryCount = 0;
  for (const originalLine of output.split(/\r?\n/u)) {
    const line = originalLine.replace(ANSI_COLOR_PATTERN, "").trim();
    if (line.length === 0) continue;
    const summary = /^(\d+)\s+Flows?\s+(Passed|Failed|Skipped)$/iu.exec(line);
    if (summary !== null) {
      const count = Number(summary[1]);
      const status = summary[2]?.toLowerCase();
      if (status === "passed") {
        totals.passed += count;
        passedSummaryCount += 1;
      } else if (status === "failed") totals.failed += count;
      else if (status === "skipped") totals.skipped += count;
      continue;
    }
    if (/\b(?:error|flow|flows|failed|failure|skipped)\b/iu.test(line))
      return undefined;
  }
  return passedSummaryCount === 1 &&
    totals.passed === 1 &&
    totals.failed === 0 &&
    totals.skipped === 0
    ? totals
    : undefined;
};

export const runMobileD0Evidence = async (
  args: string[],
  dependencies: MobileD0EvidenceDependencies = defaultDependencies,
): Promise<void> => {
  const platform = parsePlatform(args);
  const discoveredCommit = await dependencies.discoverCommit();
  if (!SHA_PATTERN.test(discoveredCommit))
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "cannot discover an exact HEAD commit",
    );
  const artifactDirectory = dependencies.artifactDirectory(
    discoveredCommit,
    platform,
  );
  await dependencies.ensureArtifactDirectory(artifactDirectory);
  const records: RecordedCommand[] = [];

  const run = async (request: CommandRequest): Promise<CommandResult> => {
    if (!isAbsolute(request.executable))
      throw new QualityGateError(
        "D0_MOBILE_TOOL_UNTRUSTED",
        `${request.label} executable must be absolute`,
      );
    const commandResult = await dependencies.runCommand(request);
    records.push({
      args: request.args,
      cwd: request.cwd,
      executable: request.executable,
      ...(commandResult.errorMessage === undefined
        ? {}
        : { error_message: commandResult.errorMessage }),
      exit_code: commandResult.exitCode,
      label: request.label,
      signal: commandResult.signal,
    });
    await dependencies.writeArtifact(
      artifactDirectory,
      `${request.label}.log`,
      commandLog(request, commandResult),
    );
    return commandResult;
  };

  const tools = await dependencies.resolveTools(platform);
  const invalidTools = new Set<ToolName>();
  const changedTools = new Set<ToolName>();
  const runTool = async (
    name: ToolName,
    args: string[],
    cwd: string,
    label: string,
    timeoutMs?: number,
  ): Promise<CommandResult | undefined> => {
    const tool = tools[name];
    if (tool === undefined) return undefined;
    if (!(await dependencies.verifyToolIdentity(tool))) {
      invalidTools.add(name);
      changedTools.add(name);
      return undefined;
    }
    return await run({
      args: [...tool.prefixArgs, ...args],
      cwd,
      executable: tool.executable,
      label,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  };

  for (const name of Object.keys(tools).sort() as ToolName[]) {
    const contract = versionContract(name);
    const probe = await runTool(
      name,
      contract.args,
      dependencies.repositoryRoot,
      `tool-${name}-version`,
    );
    const versionOutput =
      `${probe?.stdout ?? ""}\n${probe?.stderr ?? ""}`.trim();
    if (probe?.exitCode !== 0 || !contract.pattern.test(versionOutput))
      invalidTools.add(name);
    else if (tools[name] !== undefined) tools[name].version = versionOutput;
  }
  const toolSummary = Object.fromEntries(
    Object.entries(tools).map(([name, identity]) => [
      name,
      {
        executable: identity.executable,
        components: identity.components,
        realpath: identity.realpath,
        sha256: identity.sha256,
        version: identity.version ?? null,
      },
    ]),
  );
  const writeSummary = async (
    verified: boolean,
    reason: string | null,
    totals: Readonly<{ failed: number; passed: number; skipped: number }>,
  ): Promise<void> => {
    await dependencies.writeArtifact(
      artifactDirectory,
      "summary.json",
      `${JSON.stringify(
        {
          schema_version: 1,
          commit_sha: discoveredCommit,
          failed: totals.failed,
          flow_count: totals.passed,
          generated_at: dependencies.now().toISOString(),
          passed: totals.passed,
          platform,
          reason,
          skipped: totals.skipped,
          tools: toolSummary,
          tool_errors: [
            ...invalidTools,
            ...(
              [
                "git",
                "tar",
                "node",
                "pnpm",
                platform === "ios" ? "xcrun" : "adb",
                "maestro",
              ] as ToolName[]
            ).filter((name) => tools[name] === undefined),
          ].sort(),
          verified,
          commands: records,
        },
        null,
        2,
      )}\n`,
    );
  };
  const finishNotVerified = async (reason: string): Promise<never> => {
    await writeSummary(false, reason, { failed: 0, passed: 0, skipped: 0 });
    dependencies.output(
      `D0_MOBILE NOT_VERIFIED platform=${platform} reason=${reason}`,
    );
    throw new QualityGateError("D0_MOBILE_NOT_VERIFIED", reason);
  };

  for (const coreTool of ["node", "git", "tar", "pnpm"] as ToolName[]) {
    if (tools[coreTool] === undefined)
      return await finishNotVerified(`tool_identity_missing:${coreTool}`);
    if (invalidTools.has(coreTool))
      return await finishNotVerified(`tool_identity_invalid:${coreTool}`);
  }
  const head = await runTool(
    "git",
    ["rev-parse", "HEAD"],
    dependencies.repositoryRoot,
    "git-head",
  );
  if (head === undefined && changedTools.has("git"))
    return await finishNotVerified("tool_identity_changed:git");
  const commit = head?.stdout.trim() ?? "";
  if (
    head?.exitCode !== 0 ||
    !SHA_PATTERN.test(commit) ||
    commit !== discoveredCommit
  )
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "cannot resolve the discovered exact HEAD commit",
    );
  const status = await runTool(
    "git",
    ["status", "--porcelain"],
    dependencies.repositoryRoot,
    "git-status",
  );
  if (status === undefined && changedTools.has("git"))
    return await finishNotVerified("tool_identity_changed:git");
  if (status?.exitCode !== 0 || status.stdout.trim().length > 0)
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "evidence requires a clean worktree",
    );

  let target: MobileTarget | undefined;
  let reason: string | undefined;
  if (platform === "ios") {
    if (tools.xcrun === undefined || invalidTools.has("xcrun"))
      reason = `ios_xcrun_unavailable:tool_identity_${
        tools.xcrun === undefined ? "missing" : "invalid"
      }`;
    else {
      const probe = await runTool(
        "xcrun",
        ["simctl", "list", "devices", "available", "--json"],
        dependencies.repositoryRoot,
        "ios-probe",
      );
      if (probe === undefined)
        reason = "ios_xcrun_unavailable:tool_identity_missing";
      else if (probe.exitCode !== 0)
        reason = `ios_xcrun_unavailable:${commandFailureReason(probe)}`;
      else {
        target = iosTarget(probe.stdout);
        if (target === undefined) reason = "ios_no_available_simulator";
      }
    }
  } else {
    if (tools.adb === undefined || invalidTools.has("adb"))
      reason = `android_adb_unavailable:tool_identity_${
        tools.adb === undefined ? "missing" : "invalid"
      }`;
    else {
      const probe = await runTool(
        "adb",
        ["devices"],
        dependencies.repositoryRoot,
        "android-probe",
      );
      if (probe === undefined)
        reason = "android_adb_unavailable:tool_identity_missing";
      else if (probe.exitCode !== 0)
        reason = `android_adb_unavailable:${commandFailureReason(probe)}`;
      else {
        target = androidTarget(probe.stdout);
        if (target === undefined) reason = "android_no_connected_device";
      }
    }
  }

  const snapshot = await dependencies.createSnapshot();
  try {
    const archive = await runTool(
      "git",
      ["archive", "--format=tar", `--output=${snapshot.archivePath}`, commit],
      dependencies.repositoryRoot,
      "snapshot-archive",
    );
    if (archive === undefined)
      return await finishNotVerified(
        changedTools.has("git")
          ? "tool_identity_changed:git"
          : "snapshot_archive_failed:git_missing",
      );
    if (archive.exitCode !== 0)
      return await finishNotVerified(
        `snapshot_archive_failed:${commandFailureReason(archive)}`,
      );
    const extract = await runTool(
      "tar",
      ["-xf", snapshot.archivePath, "-C", snapshot.root],
      snapshot.temporaryRoot,
      "snapshot-extract",
    );
    if (extract === undefined)
      return await finishNotVerified(
        changedTools.has("tar")
          ? "tool_identity_changed:tar"
          : "snapshot_extract_failed:tar_missing",
      );
    if (extract.exitCode !== 0)
      return await finishNotVerified(
        `snapshot_extract_failed:${commandFailureReason(extract)}`,
      );

    const install = await runTool(
      "pnpm",
      ["install", "--frozen-lockfile", "--offline"],
      snapshot.root,
      "snapshot-install",
      BUILD_TIMEOUT_MS,
    );
    const exportResult = await runTool(
      "pnpm",
      [
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
      snapshot.root,
      "expo-export",
      BUILD_TIMEOUT_MS,
    );
    const prebuild = await runTool(
      "pnpm",
      [
        "--filter",
        "@huoqiu/mobile",
        "exec",
        "expo",
        "prebuild",
        "--no-install",
        "--platform",
        platform,
      ],
      snapshot.root,
      "expo-prebuild",
      BUILD_TIMEOUT_MS,
    );

    if (reason !== undefined) return await finishNotVerified(reason);
    if (install?.exitCode !== 0)
      return await finishNotVerified("snapshot_install_failed");
    if (exportResult?.exitCode !== 0)
      return await finishNotVerified("expo_export_failed");
    if (prebuild?.exitCode !== 0)
      return await finishNotVerified("expo_prebuild_failed");
    if (target === undefined)
      return await finishNotVerified(`${platform}_target_unavailable`);
    if (tools.maestro === undefined)
      return await finishNotVerified(
        "maestro_unavailable:tool_identity_missing",
      );
    if (invalidTools.has("maestro"))
      return await finishNotVerified(
        "maestro_unavailable:tool_identity_invalid",
      );

    if (platform === "ios" && target.state !== "Booted") {
      const boot = await runTool(
        "xcrun",
        ["simctl", "boot", target.id],
        snapshot.root,
        "ios-boot",
      );
      if (boot?.exitCode !== 0)
        return await finishNotVerified("ios_simulator_boot_failed");
      const bootStatus = await runTool(
        "xcrun",
        ["simctl", "bootstatus", target.id, "-b"],
        snapshot.root,
        "ios-boot-status",
        BUILD_TIMEOUT_MS,
      );
      if (bootStatus?.exitCode !== 0)
        return await finishNotVerified("ios_simulator_boot_status_failed");
    }

    const launch = await runTool(
      "pnpm",
      [
        "--filter",
        "@huoqiu/mobile",
        "exec",
        "expo",
        `run:${platform}`,
        "--no-install",
        "--device",
        target.id,
      ],
      snapshot.root,
      "app-launch",
      BUILD_TIMEOUT_MS,
    );
    if (launch?.exitCode !== 0)
      return await finishNotVerified(`${platform}_build_or_launch_failed`);

    const flow = await runTool(
      "maestro",
      ["--device", target.id, "test", "tests/e2e/maestro/d0/golden.yaml"],
      snapshot.root,
      "maestro-flow",
      BUILD_TIMEOUT_MS,
    );
    if (flow?.exitCode !== 0)
      return await finishNotVerified("maestro_flow_failed");
    const flowOutput = `${flow.stdout}\n${flow.stderr}`;
    const totals = maestroTotals(flowOutput);
    if (totals === undefined) {
      const hasPassedSummary = /^1\s+Flow Passed$/imu.test(flowOutput);
      return await finishNotVerified(
        hasPassedSummary
          ? "maestro_flow_result_invalid"
          : "maestro_flow_result_missing",
      );
    }

    await writeSummary(true, null, totals);
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
