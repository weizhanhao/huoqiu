import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMainModule,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

export type MobileD0Platform = "android" | "ios";
export type MobileD0ToolName =
  "adb" | "git" | "maestro" | "node" | "pnpm" | "pod" | "tar" | "xcrun";
type ToolName = MobileD0ToolName;

export interface CommandRequest {
  args: string[];
  cwd: string;
  executable: string;
  label: string;
  platform: MobileD0Platform;
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
  readonly components: readonly ToolComponentIdentity[];
  readonly executable: string;
  readonly expectedVersion: string;
  readonly name: MobileD0ToolName;
  readonly prefixArgs: readonly string[];
  readonly realpath: string;
  readonly registry: ToolComponentIdentity;
  readonly sha256: string;
}

export interface ToolComponentIdentity {
  readonly mode: number;
  readonly path: string;
  readonly realpath: string;
  readonly sha256: string;
  readonly uid: number;
}

export type ToolSet = Readonly<Partial<Record<MobileD0ToolName, ToolIdentity>>>;

export interface ToolchainPathMetadata {
  isDirectory: () => boolean;
  isFile: () => boolean;
  mode: number;
  uid: number;
}

export interface ToolchainResolverDependencies {
  readDirectory: (path: string) => Promise<readonly string[]>;
  readBytes: (path: string) => Promise<Uint8Array>;
  realpath: (path: string) => Promise<string>;
  stat: (path: string) => Promise<ToolchainPathMetadata>;
}

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

export interface PreparedMobileD0EvidenceDependencies {
  resolveTools: (platform: MobileD0Platform) => Promise<ToolSet>;
  runCommand: (request: CommandRequest) => Promise<CommandResult>;
  verifyToolIdentity: (identity: ToolIdentity) => Promise<boolean>;
}

export interface PreparedMobileD0CommandRecord {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly executable: string;
  readonly exit_code: number;
  readonly label: string;
  readonly signal: NodeJS.Signals | null;
}

export interface PreparedMobileD0ToolReport {
  readonly components: readonly ToolComponentIdentity[];
  readonly executable: string;
  readonly expected_version: string;
  readonly registry: ToolComponentIdentity;
  readonly version: string;
}

export interface PreparedMobileD0EvidenceResult {
  readonly commands: readonly PreparedMobileD0CommandRecord[];
  readonly failed: 0;
  readonly flow_count: 1;
  readonly passed: 1;
  readonly platform: MobileD0Platform;
  readonly report_type: "mobile-d0-prepared-raw-v1";
  readonly schema_version: 1;
  readonly skipped: 0;
  readonly target_id: string;
  readonly tools: Readonly<
    Partial<Record<MobileD0ToolName, PreparedMobileD0ToolReport>>
  >;
}

export interface MobileTarget {
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
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_VERSION_PATTERN = /^[\x20-\x7e]+(?:\n[\x20-\x7e]+)*$/u;
const MAX_VERSION_BYTES = 4096;
const MAX_REGISTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOOL_COMPONENTS = 262_144;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCodePoint(27)}\\[[0-9;]*m`,
  "gu",
);
const MOBILE_D0_TOOLCHAIN_ROOT = "/opt/huoqiu-quality/mobile-d0";
export const MOBILE_D0_TOOLCHAIN_REGISTRY_PATH = `${MOBILE_D0_TOOLCHAIN_ROOT}/toolchain.v1.json`;
const PROTECTED_TOOL_PATHS = {
  adb: `${MOBILE_D0_TOOLCHAIN_ROOT}/android/platform-tools/adb`,
  java: `${MOBILE_D0_TOOLCHAIN_ROOT}/java/bin/java`,
  maestro: `${MOBILE_D0_TOOLCHAIN_ROOT}/maestro/maestro-cli.jar`,
  node: `${MOBILE_D0_TOOLCHAIN_ROOT}/node/bin/node`,
  pnpm: `${MOBILE_D0_TOOLCHAIN_ROOT}/pnpm/pnpm.cjs`,
  pod: `${MOBILE_D0_TOOLCHAIN_ROOT}/ios/bin/pod`,
} as const;
const PROTECTED_PNPM_STORE = `${MOBILE_D0_TOOLCHAIN_ROOT}/pnpm/store`;
const PROTECTED_EXPO_CLI = "apps/mobile/node_modules/expo/bin/cli";
const PROTECTED_ANDROID_SDK = `${MOBILE_D0_TOOLCHAIN_ROOT}/android`;
const PROTECTED_ANDROID_GRADLE_SEED_MARKER = `${PROTECTED_ANDROID_SDK}/gradle-home-seed/.huoqiu-reviewed`;
const PROTECTED_IOS_SUPPORT_ROOT = `${MOBILE_D0_TOOLCHAIN_ROOT}/ios`;
const PROTECTED_IOS_POD = `${PROTECTED_IOS_SUPPORT_ROOT}/bin/pod`;
const PROTECTED_IOS_CACHE_SEED_MARKER = `${PROTECTED_IOS_SUPPORT_ROOT}/native-home-seed/.huoqiu-reviewed`;
const PROTECTED_JAVA_HOME = `${MOBILE_D0_TOOLCHAIN_ROOT}/java`;
const PROTECTED_NODE_BIN = `${MOBILE_D0_TOOLCHAIN_ROOT}/node/bin`;
const IOS_DEVELOPER_DIRECTORY = "/Applications/Xcode.app/Contents/Developer";
const TRUSTED_COMPONENT_ROOTS: Readonly<Record<ToolName, readonly string[]>> = {
  adb: [`${MOBILE_D0_TOOLCHAIN_ROOT}/android`],
  git: ["/usr/bin"],
  maestro: [
    `${MOBILE_D0_TOOLCHAIN_ROOT}/java`,
    `${MOBILE_D0_TOOLCHAIN_ROOT}/maestro`,
  ],
  node: [`${MOBILE_D0_TOOLCHAIN_ROOT}/node`],
  pnpm: [
    `${MOBILE_D0_TOOLCHAIN_ROOT}/node`,
    `${MOBILE_D0_TOOLCHAIN_ROOT}/pnpm`,
  ],
  pod: [PROTECTED_IOS_SUPPORT_ROOT],
  tar: ["/usr/bin"],
  xcrun: ["/usr/bin"],
};
const COMPLETE_COMPONENT_ROOTS: Readonly<Record<ToolName, readonly string[]>> =
  {
    adb: [`${MOBILE_D0_TOOLCHAIN_ROOT}/android`],
    git: [],
    maestro: [
      `${MOBILE_D0_TOOLCHAIN_ROOT}/java`,
      `${MOBILE_D0_TOOLCHAIN_ROOT}/maestro`,
    ],
    node: [`${MOBILE_D0_TOOLCHAIN_ROOT}/node`],
    pnpm: [
      `${MOBILE_D0_TOOLCHAIN_ROOT}/node`,
      `${MOBILE_D0_TOOLCHAIN_ROOT}/pnpm`,
    ],
    pod: [PROTECTED_IOS_SUPPORT_ROOT],
    tar: [],
    xcrun: [],
  };
const REQUIRED_COMPONENT_DIRECTORIES: Readonly<
  Record<ToolName, readonly string[]>
> = {
  adb: [],
  git: [],
  maestro: [],
  node: [],
  pnpm: [PROTECTED_PNPM_STORE],
  pod: [],
  tar: [],
  xcrun: [],
};
const REQUIRED_COMPONENT_FILES: Readonly<Record<ToolName, readonly string[]>> =
  {
    adb: [PROTECTED_ANDROID_GRADLE_SEED_MARKER],
    git: [],
    maestro: [],
    node: [],
    pnpm: [],
    pod: [PROTECTED_IOS_POD, PROTECTED_IOS_CACHE_SEED_MARKER],
    tar: [],
    xcrun: [],
  };

const defaultToolchainResolverDependencies: ToolchainResolverDependencies = {
  readDirectory: async (path) => await readdir(path),
  readBytes: async (path) => await readFile(path),
  realpath,
  stat,
};

const isWithinPath = (root: string, candidate: string): boolean => {
  const relation = relative(root, candidate);
  return (
    relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))
  );
};

const isMobileD0Platform = (value: unknown): value is MobileD0Platform =>
  value === "android" || value === "ios";

const isDeclaredComponentPathAllowed = (
  name: ToolName,
  candidate: string,
): boolean =>
  isAbsolute(candidate) &&
  resolve(candidate) === candidate &&
  TRUSTED_COMPONENT_ROOTS[name].some((root) => isWithinPath(root, candidate));

const isCanonicalComponentPathAllowed = async (
  name: ToolName,
  candidate: string,
  dependencies: ToolchainResolverDependencies,
): Promise<boolean> => {
  for (const root of TRUSTED_COMPONENT_ROOTS[name]) {
    const canonicalRoot = await dependencies.realpath(root);
    if (canonicalRoot !== root) continue;
    if (isWithinPath(canonicalRoot, candidate)) return true;
  }
  return false;
};

const parsePlatform = (args: string[]): MobileD0Platform => {
  const flags = parseStrictFlags(args, new Set(["--platform"]));
  const platform = requiredFlag(flags, "--platform");
  if (!isMobileD0Platform(platform))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "--platform must be ios or android",
    );
  return platform;
};

export const parseMobileD0Platform = parsePlatform;

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

export const parseAndroidMobileTarget = androidTarget;
export const parseIosMobileTarget = iosTarget;

const safeEnvironment = (platform: MobileD0Platform): NodeJS.ProcessEnv => {
  if (!isMobileD0Platform(platform))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "platform must be ios or android",
    );
  return {
    ...(platform === "android"
      ? {
          ANDROID_HOME: PROTECTED_ANDROID_SDK,
          ANDROID_SDK_ROOT: PROTECTED_ANDROID_SDK,
        }
      : { DEVELOPER_DIR: IOS_DEVELOPER_DIRECTORY }),
    CI: "1",
    HOME: "/var/empty",
    JAVA_HOME: PROTECTED_JAVA_HOME,
    LANG: "C",
    LC_ALL: "C",
    NODE: PROTECTED_TOOL_PATHS.node,
    npm_node_execpath: PROTECTED_TOOL_PATHS.node,
    PATH: `${PROTECTED_NODE_BIN}:${PROTECTED_JAVA_HOME}/bin${
      platform === "ios" ? `:${PROTECTED_IOS_SUPPORT_ROOT}/bin` : ""
    }:/usr/bin:/bin`,
    TMPDIR: "/tmp",
  };
};

export const mobileD0SafeEnvironment = safeEnvironment;

const defaultRunCommand = async (
  request: CommandRequest,
): Promise<CommandResult> =>
  await new Promise((resolvePromise) => {
    execFile(
      request.executable,
      request.args,
      {
        cwd: request.cwd,
        env: safeEnvironment(request.platform),
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
  if (!isMobileD0Platform(platform))
    return {
      adb: [],
      git: [],
      maestro: [],
      node: [],
      pnpm: [],
      pod: [],
      tar: [],
      xcrun: [],
    };
  return {
    adb: platform === "android" ? [PROTECTED_TOOL_PATHS.adb] : [],
    git: ["/usr/bin/git"],
    maestro: [PROTECTED_TOOL_PATHS.maestro],
    node: [PROTECTED_TOOL_PATHS.node],
    pnpm: [PROTECTED_TOOL_PATHS.pnpm],
    pod: platform === "ios" ? [PROTECTED_TOOL_PATHS.pod] : [],
    tar: ["/usr/bin/tar"],
    xcrun: platform === "ios" ? ["/usr/bin/xcrun"] : [],
  };
};

const requiredToolNames = (platform: MobileD0Platform): readonly ToolName[] => {
  if (!isMobileD0Platform(platform))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "platform must be ios or android",
    );
  return [
    "git",
    "tar",
    "node",
    "pnpm",
    platform === "ios" ? "xcrun" : "adb",
    ...(platform === "ios" ? (["pod"] as const) : []),
    "maestro",
  ];
};

export const mobileD0RequiredToolNames = requiredToolNames;

const hasRootOwnedImmutableChain = async (
  path: string,
  dependencies: ToolchainResolverDependencies = defaultToolchainResolverDependencies,
): Promise<boolean> => {
  let cursor = path;
  const filesystemRoot = parse(path).root;
  while (true) {
    const metadata = await dependencies.stat(cursor);
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) return false;
    if (cursor === filesystemRoot) return true;
    cursor = dirname(cursor);
  }
};

const readComponentIdentity = async (
  candidate: string,
  dependencies: ToolchainResolverDependencies = defaultToolchainResolverDependencies,
): Promise<
  { contents: Uint8Array; identity: ToolComponentIdentity } | undefined
> => {
  if (!isAbsolute(candidate)) return undefined;
  try {
    const canonicalPath = await dependencies.realpath(candidate);
    const metadata = await dependencies.stat(canonicalPath);
    if (
      !metadata.isFile() ||
      !(await hasRootOwnedImmutableChain(canonicalPath, dependencies))
    )
      return undefined;
    const contents = await dependencies.readBytes(canonicalPath);
    return {
      contents,
      identity: {
        mode: metadata.mode,
        path: candidate,
        realpath: canonicalPath,
        sha256: createHash("sha256").update(contents).digest("hex"),
        uid: metadata.uid,
      },
    };
  } catch {
    return undefined;
  }
};

const componentIdentity = async (
  candidate: string,
  dependencies: ToolchainResolverDependencies = defaultToolchainResolverDependencies,
): Promise<ToolComponentIdentity | undefined> =>
  (await readComponentIdentity(candidate, dependencies))?.identity;

const protectedDirectory = async (
  directory: string,
  dependencies: ToolchainResolverDependencies,
): Promise<boolean> => {
  const canonicalDirectory = await dependencies.realpath(directory);
  if (canonicalDirectory !== directory) return false;
  const metadata = await dependencies.stat(canonicalDirectory);
  return (
    metadata.isDirectory() &&
    (await hasRootOwnedImmutableChain(canonicalDirectory, dependencies))
  );
};

const completeRootInventory = async (
  root: string,
  dependencies: ToolchainResolverDependencies,
): Promise<readonly string[] | undefined> => {
  try {
    if (!(await protectedDirectory(root, dependencies))) return undefined;
    const directories = [root];
    const visitedDirectories = new Set<string>();
    const files: string[] = [];
    while (directories.length > 0) {
      const directory = directories.pop();
      if (directory === undefined || visitedDirectories.has(directory))
        return undefined;
      visitedDirectories.add(directory);
      if (visitedDirectories.size + files.length > MAX_TOOL_COMPONENTS)
        return undefined;
      const names = await dependencies.readDirectory(directory);
      const uniqueNames = new Set(names);
      if (uniqueNames.size !== names.length) return undefined;
      for (const name of [...uniqueNames].sort()) {
        if (
          name.length === 0 ||
          name === "." ||
          name === ".." ||
          name.includes("/") ||
          name.includes("\0")
        )
          return undefined;
        const child = join(directory, name);
        const canonicalChild = await dependencies.realpath(child);
        if (!isWithinPath(root, canonicalChild)) return undefined;
        const metadata = await dependencies.stat(canonicalChild);
        if (metadata.isDirectory()) {
          if (
            canonicalChild !== child ||
            !(await hasRootOwnedImmutableChain(canonicalChild, dependencies))
          )
            return undefined;
          directories.push(child);
        } else if (metadata.isFile()) {
          if (!(await hasRootOwnedImmutableChain(canonicalChild, dependencies)))
            return undefined;
          files.push(child);
        } else return undefined;
        if (visitedDirectories.size + files.length > MAX_TOOL_COMPONENTS)
          return undefined;
      }
    }
    return files.sort();
  } catch {
    return undefined;
  }
};

const completeComponentPaths = async (
  name: ToolName,
  dependencies: ToolchainResolverDependencies,
): Promise<readonly string[] | undefined> => {
  try {
    for (const required of REQUIRED_COMPONENT_DIRECTORIES[name]) {
      if (!(await protectedDirectory(required, dependencies))) return undefined;
    }
    const roots = COMPLETE_COMPONENT_ROOTS[name];
    const candidate = trustedToolCandidates(
      name === "xcrun" || name === "pod" ? "ios" : "android",
    )[name][0];
    if (candidate === undefined) return undefined;
    const paths = new Set<string>([candidate]);
    for (const root of roots) {
      const inventory = await completeRootInventory(root, dependencies);
      if (inventory === undefined) return undefined;
      for (const path of inventory) paths.add(path);
      if (paths.size > MAX_TOOL_COMPONENTS) return undefined;
    }
    if (REQUIRED_COMPONENT_FILES[name].some((path) => !paths.has(path)))
      return undefined;
    return [...paths].sort();
  } catch {
    return undefined;
  }
};

interface RegistryComponent {
  path: string;
  sha256: string;
}

interface RegistryTool {
  components: RegistryComponent[];
  expected_version: string;
}

const hasExactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

const registryTool = (value: unknown): RegistryTool | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  if (!hasExactKeys(value, ["components", "expected_version"]))
    return undefined;
  const candidate = value as Partial<RegistryTool>;
  if (
    typeof candidate.expected_version !== "string" ||
    candidate.expected_version.length > MAX_VERSION_BYTES ||
    !SAFE_VERSION_PATTERN.test(candidate.expected_version) ||
    candidate.expected_version.trim() !== candidate.expected_version ||
    !Array.isArray(candidate.components) ||
    candidate.components.length === 0 ||
    candidate.components.length > MAX_TOOL_COMPONENTS
  )
    return undefined;
  const components = candidate.components.filter(
    (component): component is RegistryComponent =>
      typeof component === "object" &&
      component !== null &&
      hasExactKeys(component, ["path", "sha256"]) &&
      typeof (component as Partial<RegistryComponent>).path === "string" &&
      (component as RegistryComponent).path.length <= 4096 &&
      typeof (component as Partial<RegistryComponent>).sha256 === "string" &&
      SHA256_PATTERN.test((component as RegistryComponent).sha256),
  );
  return components.length === candidate.components.length
    ? { components, expected_version: candidate.expected_version }
    : undefined;
};

const launchIdentity = (
  name: ToolName,
  components: ToolComponentIdentity[],
  expectedVersion: string,
  registry: ToolComponentIdentity,
): ToolIdentity | undefined => {
  const candidate = trustedToolCandidates(
    name === "xcrun" || name === "pod" ? "ios" : "android",
  )[name][0];
  if (candidate === undefined) return undefined;
  const entrypoint = components.find(({ path }) => path === candidate);
  if (entrypoint === undefined) return undefined;
  const launcherPath =
    name === "pnpm"
      ? PROTECTED_TOOL_PATHS.node
      : name === "maestro"
        ? PROTECTED_TOOL_PATHS.java
        : candidate;
  const launcher = components.find(({ path }) => path === launcherPath);
  if (launcher === undefined) return undefined;
  const frozenComponents = Object.freeze(
    components.map((component) => Object.freeze({ ...component })),
  );
  const prefixArgs = Object.freeze(
    name === "pnpm"
      ? [entrypoint.realpath]
      : name === "maestro"
        ? ["-jar", entrypoint.realpath]
        : [],
  );
  return Object.freeze({
    components: frozenComponents,
    executable: launcher.realpath,
    expectedVersion,
    name,
    prefixArgs,
    realpath: entrypoint.realpath,
    registry: Object.freeze({ ...registry }),
    sha256: entrypoint.sha256,
  });
};

const EMPTY_TOOL_SET: ToolSet = Object.freeze({});

export const resolveTrustedTools = async (
  platform: MobileD0Platform,
  dependencies: ToolchainResolverDependencies = defaultToolchainResolverDependencies,
): Promise<ToolSet> => {
  if (!isMobileD0Platform(platform)) return EMPTY_TOOL_SET;
  try {
    const [protectedRootRealpath, registryRealpath] = await Promise.all([
      dependencies.realpath(MOBILE_D0_TOOLCHAIN_ROOT),
      dependencies.realpath(MOBILE_D0_TOOLCHAIN_REGISTRY_PATH),
    ]);
    const registryMetadata = await dependencies.stat(registryRealpath);
    if (
      protectedRootRealpath !== MOBILE_D0_TOOLCHAIN_ROOT ||
      !registryMetadata.isFile() ||
      !isWithinPath(protectedRootRealpath, registryRealpath) ||
      !(await hasRootOwnedImmutableChain(registryRealpath, dependencies))
    )
      return EMPTY_TOOL_SET;
    const registryRead = await readComponentIdentity(
      MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
      dependencies,
    );
    if (
      registryRead === undefined ||
      registryRead.identity.realpath !== registryRealpath ||
      registryRead.contents.byteLength > MAX_REGISTRY_BYTES
    )
      return EMPTY_TOOL_SET;
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(registryRead.contents),
    ) as { schema_version?: unknown; tools?: unknown };
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !hasExactKeys(parsed, ["schema_version", "tools"]) ||
      parsed.schema_version !== 1 ||
      typeof parsed.tools !== "object" ||
      parsed.tools === null
    )
      return EMPTY_TOOL_SET;
    const names = requiredToolNames(platform);
    const entries: [ToolName, ToolIdentity][] = [];
    for (const name of names) {
      const declaration = registryTool(
        (parsed.tools as Record<string, unknown>)[name],
      );
      if (declaration === undefined) return EMPTY_TOOL_SET;
      const inventory = await completeComponentPaths(name, dependencies);
      if (inventory === undefined) return EMPTY_TOOL_SET;
      const inventoryPaths = new Set(inventory);
      const components: ToolComponentIdentity[] = [];
      const declaredPaths = new Set<string>();
      for (const expected of declaration.components) {
        if (
          declaredPaths.has(expected.path) ||
          !isDeclaredComponentPathAllowed(name, expected.path) ||
          !inventoryPaths.has(expected.path)
        )
          return EMPTY_TOOL_SET;
        declaredPaths.add(expected.path);
        const identity = await componentIdentity(expected.path, dependencies);
        if (
          identity === undefined ||
          identity.sha256 !== expected.sha256 ||
          !(await isCanonicalComponentPathAllowed(
            name,
            identity.realpath,
            dependencies,
          ))
        )
          return EMPTY_TOOL_SET;
        components.push(identity);
      }
      if (declaredPaths.size !== inventoryPaths.size) return EMPTY_TOOL_SET;
      const identity = launchIdentity(
        name,
        components,
        declaration.expected_version,
        registryRead.identity,
      );
      if (identity === undefined) return EMPTY_TOOL_SET;
      entries.push([name, identity]);
    }
    return Object.freeze(Object.fromEntries(entries)) as ToolSet;
  } catch {
    return EMPTY_TOOL_SET;
  }
};

export const resolveProtectedMobileTools = async (
  platform: MobileD0Platform,
): Promise<ToolSet> =>
  isMobileD0Platform(platform)
    ? await resolveTrustedTools(platform)
    : EMPTY_TOOL_SET;

const sameComponentIdentity = (
  current: ToolComponentIdentity | undefined,
  expected: ToolComponentIdentity,
): boolean =>
  current !== undefined &&
  current.realpath === expected.realpath &&
  current.sha256 === expected.sha256 &&
  current.uid === expected.uid &&
  current.mode === expected.mode;

export const verifyTrustedToolIdentity = async (
  identity: ToolIdentity,
  dependencies: ToolchainResolverDependencies = defaultToolchainResolverDependencies,
): Promise<boolean> => {
  try {
    if (identity.components.length === 0) return false;
    if (identity.registry.path !== MOBILE_D0_TOOLCHAIN_REGISTRY_PATH)
      return false;
    const protectedRootRealpath = await dependencies.realpath(
      MOBILE_D0_TOOLCHAIN_ROOT,
    );
    if (protectedRootRealpath !== MOBILE_D0_TOOLCHAIN_ROOT) return false;
    const currentRegistryRead = await readComponentIdentity(
      identity.registry.path,
      dependencies,
    );
    const currentRegistry = currentRegistryRead?.identity;
    if (
      !sameComponentIdentity(currentRegistry, identity.registry) ||
      currentRegistry === undefined ||
      currentRegistryRead === undefined ||
      currentRegistryRead.contents.byteLength > MAX_REGISTRY_BYTES ||
      !isWithinPath(protectedRootRealpath, currentRegistry.realpath)
    )
      return false;
    const currentParsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        currentRegistryRead.contents,
      ),
    ) as { schema_version?: unknown; tools?: unknown };
    if (
      typeof currentParsed !== "object" ||
      currentParsed === null ||
      !hasExactKeys(currentParsed, ["schema_version", "tools"]) ||
      currentParsed.schema_version !== 1 ||
      typeof currentParsed.tools !== "object" ||
      currentParsed.tools === null
    )
      return false;
    const declaration = registryTool(
      (currentParsed.tools as Record<string, unknown>)[identity.name],
    );
    const inventory = await completeComponentPaths(identity.name, dependencies);
    if (
      declaration === undefined ||
      inventory === undefined ||
      declaration.expected_version !== identity.expectedVersion ||
      declaration.components.length !== identity.components.length ||
      !declaration.components.every(
        (component, index) =>
          component.path === identity.components[index]?.path &&
          component.sha256 === identity.components[index]?.sha256,
      )
    )
      return false;
    const declaredPaths = new Set(
      declaration.components.map(({ path }) => path),
    );
    const inventoryPaths = new Set(inventory);
    if (
      declaredPaths.size !== declaration.components.length ||
      inventoryPaths.size !== declaredPaths.size ||
      declaration.components.some(
        ({ path }) =>
          !isDeclaredComponentPathAllowed(identity.name, path) ||
          !inventoryPaths.has(path),
      )
    )
      return false;
    for (const expected of identity.components) {
      const current = await componentIdentity(expected.path, dependencies);
      if (
        current === undefined ||
        !sameComponentIdentity(current, expected) ||
        !(await isCanonicalComponentPathAllowed(
          identity.name,
          current.realpath,
          dependencies,
        ))
      )
        return false;
    }
    const expectedIdentity = launchIdentity(
      identity.name,
      [...identity.components],
      identity.expectedVersion,
      identity.registry,
    );
    return (
      expectedIdentity !== undefined &&
      identity.executable === expectedIdentity.executable &&
      identity.realpath === expectedIdentity.realpath &&
      identity.sha256 === expectedIdentity.sha256 &&
      identity.prefixArgs.length === expectedIdentity.prefixArgs.length &&
      identity.prefixArgs.every(
        (argument, index) => argument === expectedIdentity.prefixArgs[index],
      )
    );
  } catch {
    return false;
  }
};

export const verifyToolIdentity = async (
  identity: ToolIdentity,
): Promise<boolean> => await verifyTrustedToolIdentity(identity);

const resolveTools = async (platform: MobileD0Platform): Promise<ToolSet> => {
  return await resolveProtectedMobileTools(platform);
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
): Readonly<{ args: readonly string[]; pattern: RegExp }> => {
  switch (name) {
    case "git":
      return { args: ["--version"], pattern: /^git version \d+\.\d+/iu };
    case "tar":
      return { args: ["--version"], pattern: /\b(?:bsdtar|tar)\b.*\d+/iu };
    case "pnpm":
      return { args: ["--version"], pattern: /^11\.4\.0\s*$/u };
    case "pod":
      return { args: ["--version"], pattern: /^\d+\.\d+\.\d+\s*$/u };
    case "node":
      return { args: ["--version"], pattern: /^v24\.15\.\d+\s*$/u };
    case "xcrun":
      return { args: ["--version"], pattern: /^xcrun version \d+/iu };
    case "adb":
      return { args: ["version"], pattern: /Android Debug Bridge version/iu };
    case "maestro":
      return { args: ["--version"], pattern: /^\d+\.\d+\.\d+/u };
    default:
      throw new QualityGateError(
        "D0_MOBILE_TOOL_UNTRUSTED",
        "unknown mobile D0 tool",
      );
  }
};

export const mobileD0VersionContract = versionContract;

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

export const parseMaestroFlowTotals = maestroTotals;

export const preparedMobileD0RequiredToolNames = (
  platform: MobileD0Platform,
): readonly ToolName[] => {
  if (!isMobileD0Platform(platform))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "platform must be ios or android",
    );
  return platform === "ios"
    ? ["node", "xcrun", "pod", "maestro"]
    : ["node", "adb", "maestro"];
};

const defaultPreparedMobileD0EvidenceDependencies: PreparedMobileD0EvidenceDependencies =
  {
    resolveTools: resolveProtectedMobileTools,
    runCommand: defaultRunCommand,
    verifyToolIdentity,
  };

const preparedFailure = (reason: string): never => {
  throw new QualityGateError("D0_MOBILE_NOT_VERIFIED", reason);
};

const preparedCommandSucceeded = (result: CommandResult): boolean =>
  result.errorMessage === undefined &&
  result.exitCode === 0 &&
  result.signal === null;

export const runPreparedMobileD0Evidence = async (
  platform: MobileD0Platform,
  workspace: string,
  dependencies: PreparedMobileD0EvidenceDependencies = defaultPreparedMobileD0EvidenceDependencies,
): Promise<PreparedMobileD0EvidenceResult> => {
  if (!isMobileD0Platform(platform))
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "platform must be ios or android",
    );
  if (
    !isAbsolute(workspace) ||
    resolve(workspace) !== workspace ||
    parse(workspace).root === workspace ||
    isWithinPath(MOBILE_D0_TOOLCHAIN_ROOT, workspace)
  )
    throw new QualityGateError(
      "D0_MOBILE_CONTEXT_INVALID",
      "prepared workspace must be an absolute normalized launcher workspace",
    );

  const requiredNames = preparedMobileD0RequiredToolNames(platform);
  let tools: ToolSet;
  try {
    tools = await dependencies.resolveTools(platform);
  } catch {
    return preparedFailure("tool_resolution_failed");
  }
  for (const name of requiredNames) {
    if (tools[name] === undefined || tools[name]?.name !== name)
      return preparedFailure(`tool_identity_missing:${name}`);
  }

  const commands: PreparedMobileD0CommandRecord[] = [];
  const observedVersions = new Map<ToolName, string>();
  const verifyIdentity = async (name: ToolName): Promise<boolean> => {
    const tool = tools[name];
    if (tool === undefined || tool.name !== name) return false;
    try {
      return await dependencies.verifyToolIdentity(tool);
    } catch {
      return false;
    }
  };
  const runTool = async (
    name: ToolName,
    args: readonly string[],
    cwd: string,
    label: string,
    timeoutMs?: number,
    supportNames: readonly ToolName[] = [],
  ): Promise<CommandResult> => {
    if (!isWithinPath(workspace, cwd))
      return preparedFailure(`command_cwd_outside_workspace:${label}`);
    const tool = tools[name];
    if (tool === undefined || tool.name !== name)
      return preparedFailure(`tool_identity_missing:${name}`);
    if (!isAbsolute(tool.executable))
      return preparedFailure(`tool_identity_untrusted:${name}`);
    const identityNames = [...new Set([name, ...supportNames])];
    for (const identityName of identityNames) {
      if (!(await verifyIdentity(identityName)))
        return preparedFailure(`tool_identity_changed:${identityName}`);
    }
    let result: CommandResult;
    try {
      result = await dependencies.runCommand({
        args: [...tool.prefixArgs, ...args],
        cwd,
        executable: tool.executable,
        label,
        platform,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    } catch {
      return preparedFailure(`command_failed:${label}`);
    }
    commands.push({
      args: Object.freeze([...tool.prefixArgs, ...args]),
      cwd,
      executable: tool.executable,
      exit_code: result.exitCode,
      label,
      signal: result.signal,
    });
    for (const identityName of identityNames) {
      if (!(await verifyIdentity(identityName)))
        return preparedFailure(`tool_identity_changed:${identityName}`);
    }
    return result;
  };

  for (const name of requiredNames) {
    const contract = mobileD0VersionContract(name);
    const probe = await runTool(
      name,
      contract.args,
      workspace,
      `tool-${name}-version`,
    );
    const versionOutput = `${probe.stdout}\n${probe.stderr}`.trim();
    if (
      !preparedCommandSucceeded(probe) ||
      !contract.pattern.test(versionOutput) ||
      versionOutput !== tools[name]?.expectedVersion
    )
      return preparedFailure(`tool_version_invalid:${name}`);
    observedVersions.set(name, versionOutput);
  }

  let target: MobileTarget | undefined;
  if (platform === "android") {
    const probe = await runTool("adb", ["devices"], workspace, "android-probe");
    if (!preparedCommandSucceeded(probe))
      return preparedFailure("android_probe_failed");
    target = parseAndroidMobileTarget(probe.stdout);
    if (target === undefined)
      return preparedFailure("android_target_unavailable");
  } else {
    const probe = await runTool(
      "xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      workspace,
      "ios-probe",
    );
    if (!preparedCommandSucceeded(probe))
      return preparedFailure("ios_probe_failed");
    target = parseIosMobileTarget(probe.stdout);
    if (target === undefined) return preparedFailure("ios_target_unavailable");
    if (target.state !== "Booted") {
      const boot = await runTool(
        "xcrun",
        ["simctl", "boot", target.id],
        workspace,
        "ios-boot",
      );
      if (!preparedCommandSucceeded(boot))
        return preparedFailure("ios_simulator_boot_failed");
      const bootStatus = await runTool(
        "xcrun",
        ["simctl", "bootstatus", target.id, "-b"],
        workspace,
        "ios-boot-status",
        BUILD_TIMEOUT_MS,
      );
      if (!preparedCommandSucceeded(bootStatus))
        return preparedFailure("ios_simulator_boot_status_failed");
    }
  }

  const mobileRoot = join(workspace, "apps", "mobile");
  const expoCli = join(workspace, PROTECTED_EXPO_CLI);
  const platformSupport: readonly ToolName[] =
    platform === "ios" ? ["xcrun", "pod"] : ["adb", "maestro"];
  const prebuild = await runTool(
    "node",
    [expoCli, "prebuild", "--no-install", "--platform", platform],
    mobileRoot,
    "expo-prebuild",
    BUILD_TIMEOUT_MS,
    platformSupport,
  );
  if (!preparedCommandSucceeded(prebuild))
    return preparedFailure("expo_prebuild_failed");

  const launch = await runTool(
    "node",
    [expoCli, `run:${platform}`, "--no-install", "--device", target.id],
    mobileRoot,
    "app-launch",
    BUILD_TIMEOUT_MS,
    platformSupport,
  );
  if (!preparedCommandSucceeded(launch))
    return preparedFailure(`${platform}_build_or_launch_failed`);

  const flow = await runTool(
    "maestro",
    ["--device", target.id, "test", "tests/e2e/maestro/d0/golden.yaml"],
    workspace,
    "maestro-flow",
    BUILD_TIMEOUT_MS,
  );
  if (!preparedCommandSucceeded(flow))
    return preparedFailure("maestro_flow_failed");
  const totals = parseMaestroFlowTotals(`${flow.stdout}\n${flow.stderr}`);
  if (totals === undefined)
    return preparedFailure("maestro_flow_result_invalid");

  for (const name of requiredNames) {
    if (!(await verifyIdentity(name)))
      return preparedFailure(`tool_identity_changed:${name}`);
  }

  const toolReports = Object.fromEntries(
    requiredNames.map((name) => {
      const tool = tools[name];
      if (tool === undefined)
        return preparedFailure(`tool_identity_missing:${name}`);
      return [
        name,
        Object.freeze({
          components: Object.freeze(
            tool.components.map((component) => Object.freeze({ ...component })),
          ),
          executable: tool.executable,
          expected_version: tool.expectedVersion,
          registry: Object.freeze({ ...tool.registry }),
          version: observedVersions.get(name) ?? "",
        }),
      ];
    }),
  ) as Readonly<Partial<Record<MobileD0ToolName, PreparedMobileD0ToolReport>>>;
  return Object.freeze({
    commands: Object.freeze(commands.map((command) => Object.freeze(command))),
    failed: 0,
    flow_count: 1,
    passed: 1,
    platform,
    report_type: "mobile-d0-prepared-raw-v1",
    schema_version: 1,
    skipped: 0,
    target_id: target.id,
    tools: Object.freeze(toolReports),
  });
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
  const observedVersions = new Map<ToolName, string>();
  const runTool = async (
    name: ToolName,
    args: readonly string[],
    cwd: string,
    label: string,
    timeoutMs?: number,
    supportNames: readonly ToolName[] = [],
  ): Promise<CommandResult | undefined> => {
    const tool = tools[name];
    if (tool === undefined) return undefined;
    const commandIdentities = [...new Set([name, ...supportNames])];
    for (const identityName of commandIdentities) {
      const identity = tools[identityName];
      if (
        identity === undefined ||
        !(await dependencies.verifyToolIdentity(identity))
      ) {
        invalidTools.add(identityName);
        changedTools.add(identityName);
        return undefined;
      }
    }
    const commandResult = await run({
      args: [...tool.prefixArgs, ...args],
      cwd,
      executable: tool.executable,
      label,
      platform,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
    for (const identityName of commandIdentities) {
      const identity = tools[identityName];
      if (
        identity === undefined ||
        !(await dependencies.verifyToolIdentity(identity))
      ) {
        invalidTools.add(identityName);
        changedTools.add(identityName);
        return undefined;
      }
    }
    return commandResult;
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
    if (
      probe?.exitCode !== 0 ||
      !contract.pattern.test(versionOutput) ||
      (tools[name]?.expectedVersion !== undefined &&
        versionOutput !== tools[name]?.expectedVersion)
    )
      invalidTools.add(name);
    else observedVersions.set(name, versionOutput);
  }
  const toolSummary = Object.fromEntries(
    Object.entries(tools).map(([name, identity]) => [
      name,
      {
        executable: identity.executable,
        components: identity.components,
        realpath: identity.realpath,
        registry: identity.registry,
        sha256: identity.sha256,
        expected_version: identity.expectedVersion,
        version: observedVersions.get(name as ToolName) ?? null,
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
            ...requiredToolNames(platform).filter(
              (name) => tools[name] === undefined,
            ),
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
    if (tools.pod === undefined || invalidTools.has("pod"))
      reason = `ios_pod_unavailable:tool_identity_${
        tools.pod === undefined ? "missing" : "invalid"
      }`;
    else if (tools.xcrun === undefined || invalidTools.has("xcrun"))
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
      [
        "install",
        "--frozen-lockfile",
        "--offline",
        "--strict-peer-dependencies",
        "--store-dir",
        PROTECTED_PNPM_STORE,
        "--package-import-method=copy",
        "--config.verify-store-integrity=true",
        "--config.side-effects-cache=false",
      ],
      snapshot.root,
      "snapshot-install",
      BUILD_TIMEOUT_MS,
    );
    const mobileRoot = join(snapshot.root, "apps", "mobile");
    const expoCli = join(snapshot.root, PROTECTED_EXPO_CLI);
    const exportResult = await runTool(
      "node",
      [
        expoCli,
        "export",
        "--platform",
        "web",
        "--output-dir",
        join(snapshot.root, ".d0-evidence", "expo-web"),
      ],
      mobileRoot,
      "expo-export",
      BUILD_TIMEOUT_MS,
    );
    const prebuild = await runTool(
      "node",
      [expoCli, "prebuild", "--no-install", "--platform", platform],
      mobileRoot,
      "expo-prebuild",
      BUILD_TIMEOUT_MS,
      platform === "ios" ? ["xcrun", "pod"] : ["adb", "maestro"],
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
      "node",
      [expoCli, `run:${platform}`, "--no-install", "--device", target.id],
      mobileRoot,
      "app-launch",
      BUILD_TIMEOUT_MS,
      platform === "ios" ? ["xcrun", "pod"] : ["adb", "maestro"],
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

    for (const name of requiredToolNames(platform)) {
      const identity = tools[name];
      if (
        identity === undefined ||
        !(await dependencies.verifyToolIdentity(identity))
      ) {
        invalidTools.add(name);
        changedTools.add(name);
        return await finishNotVerified(`tool_identity_changed:${name}`);
      }
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
