import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

export type Milestone = "d0" | "m1";

export const D0_REQUIRED_CAP_IDS = [
  "CAP-ID-001",
  "CAP-INST-001",
  "CAP-MD-001",
  "CAP-FEED-001",
  "CAP-WATCH-001",
] as const;

export const M1_REQUIRED_CAP_IDS = [
  ...D0_REQUIRED_CAP_IDS,
  "CAP-CONTENT-001",
  "CAP-SOCIAL-001",
  "CAP-NOTIF-001",
  "CAP-MOD-001",
  "CAP-PORT-001",
] as const;

const EVENT_SCHEMA_PATHS = [
  "packages/contracts/events/identity.user_registered.v1.schema.json",
  "packages/contracts/events/content.post_submitted.v1.schema.json",
  "packages/contracts/events/moderation.decision_recorded.v1.schema.json",
  "packages/contracts/events/content.post_published.v1.schema.json",
  "packages/contracts/events/content.post_hidden.v1.schema.json",
  "packages/contracts/events/content.post_restored.v1.schema.json",
  "packages/contracts/events/identity.user_suspended.v1.schema.json",
  "packages/contracts/events/social.comment_submitted.v1.schema.json",
  "packages/contracts/events/social.comment_published.v1.schema.json",
  "packages/contracts/events/social.comment_hidden.v1.schema.json",
  "packages/contracts/events/social.comment_restored.v1.schema.json",
  "packages/contracts/events/social.reaction_changed.v1.schema.json",
  "packages/contracts/events/watchlist.item_changed.v1.schema.json",
  "packages/contracts/events/notification.created.v1.schema.json",
  "packages/contracts/events/notification.read_watermark_advanced.v1.schema.json",
  "packages/contracts/events/moderation.report_submitted.v1.schema.json",
  "packages/contracts/events/portfolio.ledger_entry_posted.v1.schema.json",
  "packages/contracts/events/market.quote_revised.v1.schema.json",
] as const;

interface InputSpec {
  kind: "file" | "directory";
  path: string;
}

const EXPECTED_CONTRACT_INPUTS: Record<Milestone, readonly InputSpec[]> = {
  d0: [
    { kind: "directory", path: "packages/contracts/src/d0" },
    { kind: "file", path: "packages/contracts/src/feed/card-v1.ts" },
  ],
  m1: [
    { kind: "file", path: "packages/contracts/openapi/huoqiu.v1.yaml" },
    ...EVENT_SCHEMA_PATHS.map((path) => ({ kind: "file" as const, path })),
    { kind: "file", path: "packages/sdk/generated-manifest.json" },
  ],
};

const EXPECTED_FIXTURE_PATHS: Record<Milestone, string> = {
  d0: "packages/contracts/fixtures/d0.v1.json",
  m1: "packages/contracts/fixtures/m1.v1.json",
};

const EXPECTED_ORACLE_PATHS: Record<Milestone, string> = {
  d0: "quality/oracles/d0-required.json",
  m1: "quality/oracles/m1-required.json",
};

const EXPECTED_MANIFEST_PATHS: Record<Milestone, string> = {
  d0: "quality/manifests/d0-required.json",
  m1: "quality/manifests/m1-required.json",
};

const CONFIG_INPUT_PATHS = [
  "quality/gate-config.v1.json",
  "quality/evidence/evidence.schema.json",
  "quality/evidence/review.schema.json",
] as const;

const INVALID_TEST_MARKERS = [
  "skip",
  "fixme",
  "todo",
  "passWithNoTests",
] as const;
type InvalidTestMarker = (typeof INVALID_TEST_MARKERS)[number];

export class QualityGateError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "QualityGateError";
    this.code = code;
  }
}

const fail = (code: string, detail?: string): never => {
  throw new QualityGateError(code, detail);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (
  value: unknown,
  code: string,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) fail(code, `${label} must be an object`);
  return value as Record<string, unknown>;
};

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(
      code,
      `${label} keys must equal ${wanted.join(",")}; got ${actual.join(",")}`,
    );
  }
};

const requireString = (value: unknown, code: string, label: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(code, `${label} must be a non-empty string`);
  }
  return value as string;
};

const requireInteger = (
  value: unknown,
  code: string,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(code, `${label} must be a non-negative safe integer`);
  }
  return value as number;
};

const requireSignedInteger = (
  value: unknown,
  code: string,
  label: string,
): number => {
  if (!Number.isSafeInteger(value))
    fail(code, `${label} must be a safe integer`);
  return value as number;
};

const requireIsoDate = (
  value: unknown,
  code: string,
  label: string,
): string => {
  const text = requireString(value, code, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) ||
    Number.isNaN(Date.parse(text))
  ) {
    fail(code, `${label} must be an ISO-8601 UTC timestamp`);
  }
  return text;
};

const requireSha = (
  value: unknown,
  code: string,
  label: string,
  pattern: RegExp,
): string => {
  const text = requireString(value, code, label);
  if (!pattern.test(text)) fail(code, `${label} has an invalid digest`);
  return text;
};

const requireUniqueStrings = (
  value: unknown,
  code: string,
  label: string,
  allowEmpty = false,
): string[] => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(
      code,
      `${label} must be a${allowEmpty ? "" : " non-empty"} string array`,
    );
  }
  const strings = (value as unknown[]).map((item, index) =>
    requireString(item, code, `${label}[${index}]`),
  );
  if (new Set(strings).size !== strings.length)
    fail(code, `${label} contains duplicates`);
  return strings;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const parseJson = (contents: string, code: string, label: string): unknown => {
  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    fail(
      code,
      `${label} is invalid JSON: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
};

const readJson = async (
  root: string,
  path: string,
  code: string,
): Promise<unknown> => {
  const absolute = safeRepositoryPath(root, path, code);
  try {
    await assertNoSymlinkSegments(root, absolute, false, code);
    return parseJson(await readFile(absolute, "utf8"), code, path);
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    fail(code, `${path} cannot be read`);
  }
};

export const assertRequiredScope = (
  actual: readonly string[],
  expected: readonly string[],
): void => {
  if (
    actual.length === 0 ||
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((capId, index) => capId !== expected[index])
  ) {
    fail(
      "REQUIRED_SCOPE_MISMATCH",
      `expected ${expected.join(",")}; got ${actual.join(",")}`,
    );
  }
};

const expectedCapIds = (milestone: Milestone): readonly string[] =>
  milestone === "d0" ? D0_REQUIRED_CAP_IDS : M1_REQUIRED_CAP_IDS;

const validateMilestone = (value: unknown, code: string): Milestone => {
  if (value !== "d0" && value !== "m1")
    fail(code, "milestone must be d0 or m1");
  return value as Milestone;
};

export interface RunCommand {
  executable: string;
  args: string[];
}

const FORBIDDEN_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "fish",
  "powershell",
  "pwsh",
  "sh",
  "zsh",
]);

export const validateCommand = (
  value: unknown,
  code = "COMMAND_INVALID",
): RunCommand => {
  const command = requireRecord(value, code, "command");
  assertExactKeys(command, ["executable", "args"], code, "command");
  const executable = requireString(
    command.executable,
    code,
    "command.executable",
  );
  if (
    /\s/.test(executable) ||
    FORBIDDEN_EXECUTABLES.has(executable.toLowerCase())
  ) {
    fail(code, "command executable must be a non-shell argv token");
  }
  if (!Array.isArray(command.args)) fail(code, "command.args must be an array");
  const args = (command.args as unknown[]).map((arg, index) =>
    requireString(arg, code, `command.args[${index}]`),
  );
  return { executable, args };
};

export interface CapabilityManifestItem {
  cap_id: string;
  command: RunCommand;
  implementer_ids: string[];
}

export interface CapabilityManifest {
  schema_version: 1;
  milestone: Milestone;
  fixture_version: string;
  required_caps: CapabilityManifestItem[];
  stretch_cap_ids: string[];
}

export const validateManifest = (
  value: unknown,
  milestone: Milestone,
): CapabilityManifest => {
  const code = "MANIFEST_SCHEMA_INVALID";
  const manifest = requireRecord(value, code, "manifest");
  assertExactKeys(
    manifest,
    [
      "schema_version",
      "milestone",
      "fixture_version",
      "required_caps",
      "stretch_cap_ids",
    ],
    code,
    "manifest",
  );
  if (manifest.schema_version !== 1) fail(code, "schema_version must be 1");
  if (validateMilestone(manifest.milestone, code) !== milestone)
    fail(code, "milestone mismatch");
  const fixtureVersion = requireString(
    manifest.fixture_version,
    code,
    "fixture_version",
  );
  if (!Array.isArray(manifest.required_caps))
    fail(code, "required_caps must be an array");
  const requiredCaps = (manifest.required_caps as unknown[]).map(
    (unknownItem, index) => {
      const item = requireRecord(unknownItem, code, `required_caps[${index}]`);
      assertExactKeys(
        item,
        ["cap_id", "command", "implementer_ids"],
        code,
        `required_caps[${index}]`,
      );
      const capId = requireString(
        item.cap_id,
        code,
        `required_caps[${index}].cap_id`,
      );
      if (!/^CAP-[A-Z]+-[0-9]{3}$/.test(capId))
        fail(code, `invalid CAP ID ${capId}`);
      return {
        cap_id: capId,
        command: validateCommand(item.command, code),
        implementer_ids: requireUniqueStrings(
          item.implementer_ids,
          code,
          `required_caps[${index}].implementer_ids`,
        ),
      };
    },
  );
  const stretchCapIds = requireUniqueStrings(
    manifest.stretch_cap_ids,
    code,
    "stretch_cap_ids",
    true,
  );
  assertRequiredScope(
    requiredCaps.map((item) => item.cap_id),
    expectedCapIds(milestone),
  );
  return {
    schema_version: 1,
    milestone,
    fixture_version: fixtureVersion,
    required_caps: requiredCaps,
    stretch_cap_ids: stretchCapIds,
  };
};

const validateOracle = (value: unknown, milestone: Milestone): void => {
  const code = "ORACLE_INTEGRITY_FAILURE";
  const oracle = requireRecord(value, code, "oracle");
  assertExactKeys(oracle, ["milestone", "required_cap_ids"], code, "oracle");
  if (validateMilestone(oracle.milestone, code) !== milestone)
    fail(code, "oracle milestone mismatch");
  const actual = requireUniqueStrings(
    oracle.required_cap_ids,
    code,
    "oracle.required_cap_ids",
  );
  try {
    assertRequiredScope(actual, expectedCapIds(milestone));
  } catch {
    fail(
      code,
      "oracle does not match the independently approved CAP IDs and order",
    );
  }
};

const toPosix = (path: string): string => path.split(sep).join("/");

export const safeRepositoryPath = (
  root: string,
  path: string,
  code = "EVIDENCE_PATH_INVALID",
): string => {
  if (isAbsolute(path) || path.includes("\0"))
    fail(code, `${path} is not a safe relative path`);
  const normalized = toPosix(path);
  if (
    normalized
      .split("/")
      .some((segment) => segment === ".." || segment.length === 0)
  ) {
    fail(code, `${path} contains traversal or empty segments`);
  }
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, path);
  if (
    absolute !== absoluteRoot &&
    !absolute.startsWith(`${absoluteRoot}${sep}`)
  ) {
    fail(code, `${path} resolves outside the repository`);
  }
  return absolute;
};

const assertEvidencePath = (root: string, path: string): string => {
  const absolute = safeRepositoryPath(root, path);
  const evidenceRoot = resolve(root, "artifacts/evidence");
  if (
    absolute !== evidenceRoot &&
    !absolute.startsWith(`${evidenceRoot}${sep}`)
  ) {
    fail("EVIDENCE_PATH_INVALID", `${path} is outside artifacts/evidence`);
  }
  return absolute;
};

const assertNoSymlinkSegments = async (
  root: string,
  absolute: string,
  allowMissingLeaf: boolean,
  code = "EVIDENCE_PATH_INVALID",
): Promise<void> => {
  const rootAbsolute = resolve(root);
  const relativePath = relative(rootAbsolute, absolute);
  let cursor = rootAbsolute;
  for (const [index, segment] of relativePath.split(sep).entries()) {
    cursor = resolve(cursor, segment);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink())
        fail(code, `${toPosix(relativePath)} traverses a symlink`);
    } catch (error) {
      if (
        allowMissingLeaf &&
        isRecord(error) &&
        error.code === "ENOENT" &&
        index <= relativePath.split(sep).length - 1
      ) {
        return;
      }
      if (error instanceof QualityGateError) throw error;
      throw error;
    }
  }
};

const readEvidenceFile = async (
  root: string,
  path: string,
  missingCode = "EVIDENCE_PATH_INVALID",
): Promise<Uint8Array> => {
  const absolute = assertEvidencePath(root, path);
  try {
    await assertNoSymlinkSegments(root, absolute, false);
    return await readFile(absolute);
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    if (isRecord(error) && error.code === "ENOENT")
      fail(missingCode, `${path} does not exist`);
    return fail("EVIDENCE_PATH_INVALID", `${path} cannot be read`);
  }
};

const readEvidenceJson = async (
  root: string,
  path: string,
  code: string,
): Promise<unknown> => {
  const contents = await readEvidenceFile(root, path, code);
  return parseJson(Buffer.from(contents).toString("utf8"), code, path);
};

const writeEvidenceFile = async (
  root: string,
  path: string,
  value: unknown,
): Promise<string> => {
  const absolute = assertEvidencePath(root, path);
  await assertNoSymlinkSegments(root, absolute, true);
  await mkdir(dirname(absolute), { recursive: true });
  await assertNoSymlinkSegments(root, dirname(absolute), false);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(absolute, contents, { encoding: "utf8", flag: "w" });
  return sha256(contents);
};

const collectDirectoryFiles = async (
  root: string,
  directoryPath: string,
): Promise<string[]> => {
  const absolute = safeRepositoryPath(
    root,
    directoryPath,
    "GATE_INPUT_MISSING",
  );
  const stat = await lstat(absolute).catch(() =>
    fail("GATE_INPUT_MISSING", `${directoryPath} does not exist`),
  );
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("GATE_INPUT_INVALID", `${directoryPath} must be a real directory`);
  }
  const output: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const absoluteEntry = resolve(current, entry.name);
      const repositoryPath = toPosix(relative(resolve(root), absoluteEntry));
      if (entry.isSymbolicLink())
        fail("GATE_INPUT_INVALID", `${repositoryPath} is a symlink`);
      if (entry.isDirectory()) await walk(absoluteEntry);
      else if (entry.isFile()) output.push(repositoryPath);
      else
        fail("GATE_INPUT_INVALID", `${repositoryPath} is not a regular file`);
    }
  };
  await walk(absolute);
  if (output.length === 0)
    fail("GATE_INPUT_MISSING", `${directoryPath} contains no files`);
  return output;
};

const expandInputs = async (
  root: string,
  inputs: readonly InputSpec[],
): Promise<string[]> => {
  const paths: string[] = [];
  for (const input of inputs) {
    safeRepositoryPath(root, input.path, "GATE_INPUT_INVALID");
    if (input.kind === "directory") {
      paths.push(...(await collectDirectoryFiles(root, input.path)));
      continue;
    }
    const absolute = safeRepositoryPath(root, input.path, "GATE_INPUT_INVALID");
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isFile())
        fail("GATE_INPUT_INVALID", `${input.path} must be a real file`);
    } catch (error) {
      if (error instanceof QualityGateError) throw error;
      fail("GATE_INPUT_MISSING", `${input.path} does not exist`);
    }
    paths.push(input.path);
  }
  const sorted = [...paths].map(toPosix).sort();
  if (sorted.length === 0 || new Set(sorted).size !== sorted.length) {
    fail("GATE_INPUT_INVALID", "hash input set must be non-empty and unique");
  }
  return sorted;
};

export const hashRepositoryInputs = async (
  root: string,
  domain: string,
  inputs: readonly InputSpec[],
): Promise<string> => {
  const files = await expandInputs(root, inputs);
  const hash = createHash("sha256");
  hash.update("HUOQIU-CONTEXT-HASH\0v1\0");
  hash.update(domain);
  hash.update("\0");
  for (const path of files) {
    const contents = await readFile(
      safeRepositoryPath(root, path, "GATE_INPUT_INVALID"),
    );
    hash.update("PATH\0");
    hash.update(path);
    hash.update("\0SIZE\0");
    hash.update(String(contents.byteLength));
    hash.update("\0CONTENT\0");
    hash.update(contents);
    hash.update("\0END\0");
  }
  return hash.digest("hex");
};

interface GateConfig {
  schema_version: 1;
  milestones: Record<
    Milestone,
    {
      oracle_path: string;
      manifest_path: string;
      fixture_path: string;
      contract_inputs: InputSpec[];
    }
  >;
  config_inputs: string[];
}

const expectedGateConfig = (): GateConfig => ({
  schema_version: 1,
  milestones: {
    d0: {
      oracle_path: EXPECTED_ORACLE_PATHS.d0,
      manifest_path: EXPECTED_MANIFEST_PATHS.d0,
      fixture_path: EXPECTED_FIXTURE_PATHS.d0,
      contract_inputs: EXPECTED_CONTRACT_INPUTS.d0.map((item) => ({ ...item })),
    },
    m1: {
      oracle_path: EXPECTED_ORACLE_PATHS.m1,
      manifest_path: EXPECTED_MANIFEST_PATHS.m1,
      fixture_path: EXPECTED_FIXTURE_PATHS.m1,
      contract_inputs: EXPECTED_CONTRACT_INPUTS.m1.map((item) => ({ ...item })),
    },
  },
  config_inputs: [...CONFIG_INPUT_PATHS],
});

const loadGateConfig = async (root: string): Promise<GateConfig> => {
  const unknownConfig = await readJson(
    root,
    "quality/gate-config.v1.json",
    "GATE_CONFIG_INTEGRITY_FAILURE",
  );
  if (canonicalJson(unknownConfig) !== canonicalJson(expectedGateConfig())) {
    fail(
      "GATE_CONFIG_INTEGRITY_FAILURE",
      "gate config differs from the approved exact input inventory",
    );
  }
  return unknownConfig as GateConfig;
};

export interface CurrentContext {
  commit_sha: string;
  base_sha: string;
  contract_sha: string;
  fixture_sha: string;
  config_sha: string;
}

export interface SpawnResult {
  command: RunCommand;
  started_at: string;
  finished_at: string;
  exit_code: number;
  signal: string | null;
  stdout: string;
  stderr: string;
}

const rawReportKeys = [
  "schema_version",
  "command",
  "started_at",
  "finished_at",
  "exit_code",
  "signal",
  "stdout",
  "stderr",
] as const;

export const validateRawReport = (value: unknown): SpawnResult => {
  const code = "RAW_REPORT_INVALID";
  const raw = requireRecord(value, code, "raw report");
  assertExactKeys(raw, rawReportKeys, code, "raw report");
  if (raw.schema_version !== 1) fail(code, "schema_version must be 1");
  const startedAt = requireIsoDate(raw.started_at, code, "started_at");
  const finishedAt = requireIsoDate(raw.finished_at, code, "finished_at");
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    fail(code, "finished_at precedes started_at");
  const signal = raw.signal;
  if (signal !== null && typeof signal !== "string")
    fail(code, "signal must be a string or null");
  return {
    command: validateCommand(raw.command, code),
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: requireSignedInteger(raw.exit_code, code, "exit_code"),
    signal: signal as string | null,
    stdout:
      typeof raw.stdout === "string"
        ? raw.stdout
        : fail(code, "stdout must be a string"),
    stderr:
      typeof raw.stderr === "string"
        ? raw.stderr
        : fail(code, "stderr must be a string"),
  };
};

export interface ExecuteCommandOptions {
  clock?: () => Date;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

const terminateProcessGroup = (child: ReturnType<typeof spawn>): void => {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
};

export const executeCommand = async (
  root: string,
  command: RunCommand,
  options: ExecuteCommandOptions = {},
): Promise<SpawnResult> => {
  const safeCommand = validateCommand(command);
  const clock = options.clock ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes <= 0
  ) {
    fail(
      "COMMAND_INVALID",
      "timeout and output limit must be positive safe integers",
    );
  }
  const startedAt = clock().toISOString();
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(safeCommand.executable, safeCommand.args, {
      cwd: root,
      detached: process.platform !== "win32",
      env: options.environment ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let terminalError: QualityGateError | undefined;
    let settled = false;
    const timeout = setTimeout(() => {
      terminalError = new QualityGateError(
        "COMMAND_TIMEOUT",
        `exceeded ${timeoutMs}ms`,
      );
      terminateProcessGroup(child);
    }, timeoutMs);
    timeout.unref();
    const appendOutput = (stream: "stdout" | "stderr", chunk: string): void => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) {
        terminalError = new QualityGateError(
          "COMMAND_OUTPUT_LIMIT",
          `exceeded ${maxOutputBytes} bytes`,
        );
        terminateProcessGroup(child);
        return;
      }
      if (stream === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      appendOutput("stdout", chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      appendOutput("stderr", chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(
        new QualityGateError("COMMAND_EXECUTION_FAILED", error.message),
      );
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (terminalError !== undefined) {
        rejectPromise(terminalError);
        return;
      }
      resolvePromise({
        command: safeCommand,
        started_at: startedAt,
        finished_at: clock().toISOString(),
        exit_code: code ?? -1,
        signal,
        stdout,
        stderr,
      });
    });
  });
};

const runGit = async (root: string, args: string[]): Promise<string> => {
  const result = await executeCommand(root, { executable: "git", args });
  if (result.exit_code !== 0)
    fail("GIT_CONTEXT_UNAVAILABLE", result.stderr.trim());
  return result.stdout.trim();
};

export const computeCurrentContext = async (
  root: string,
  milestone: Milestone,
): Promise<CurrentContext> => {
  const config = await loadGateConfig(root);
  const milestoneConfig = config.milestones[milestone];
  const commitSha = await runGit(root, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40,64}$/.test(commitSha))
    fail("GIT_CONTEXT_UNAVAILABLE", "HEAD is not a full git SHA");
  const worktreeStatus = await runGit(root, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (worktreeStatus.length > 0) {
    fail(
      "DIRTY_WORKTREE",
      "gate inputs and source must be committed before evidence runs",
    );
  }
  let baseSha: string;
  try {
    baseSha = await runGit(root, ["rev-parse", "HEAD^"]);
  } catch (error) {
    if (!(error instanceof QualityGateError)) throw error;
    baseSha = commitSha;
  }
  const contractSha = await hashRepositoryInputs(
    root,
    `contract:${milestone}`,
    milestoneConfig.contract_inputs,
  );
  const fixtureSha = await hashRepositoryInputs(root, `fixture:${milestone}`, [
    { kind: "file", path: milestoneConfig.fixture_path },
  ]);
  const configPaths = [
    ...config.config_inputs,
    milestoneConfig.oracle_path,
    milestoneConfig.manifest_path,
  ];
  const configSha = await hashRepositoryInputs(
    root,
    `gate-config:${milestone}`,
    configPaths.map((path) => ({ kind: "file", path })),
  );
  return {
    commit_sha: commitSha,
    base_sha: baseSha,
    contract_sha: contractSha,
    fixture_sha: fixtureSha,
    config_sha: configSha,
  };
};

export interface CapabilitySummary {
  fixture_version: string;
  passed: number;
  failed: number;
  skipped: number;
  invalid_test_markers: InvalidTestMarker[];
  p0: number;
  p1: number;
}

const validateSummary = (value: unknown): CapabilitySummary => {
  const code = "CAPABILITY_REPORT_INVALID";
  const summary = requireRecord(value, code, "capability summary");
  assertExactKeys(
    summary,
    [
      "fixture_version",
      "passed",
      "failed",
      "skipped",
      "invalid_test_markers",
      "p0",
      "p1",
    ],
    code,
    "capability summary",
  );
  const markerValues = requireUniqueStrings(
    summary.invalid_test_markers,
    code,
    "invalid_test_markers",
    true,
  );
  if (
    !markerValues.every((marker): marker is InvalidTestMarker =>
      (INVALID_TEST_MARKERS as readonly string[]).includes(marker),
    )
  ) {
    fail(code, "unknown invalid test marker");
  }
  return {
    fixture_version: requireString(
      summary.fixture_version,
      code,
      "fixture_version",
    ),
    passed: requireInteger(summary.passed, code, "passed"),
    failed: requireInteger(summary.failed, code, "failed"),
    skipped: requireInteger(summary.skipped, code, "skipped"),
    invalid_test_markers: markerValues as InvalidTestMarker[],
    p0: requireInteger(summary.p0, code, "p0"),
    p1: requireInteger(summary.p1, code, "p1"),
  };
};

export const parseCapabilitySummary = (stdout: string): CapabilitySummary => {
  const prefix = "HUOQIU_CAPABILITY_RESULT ";
  const lines = stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1)
    fail(
      "CAPABILITY_REPORT_INVALID",
      "expected exactly one normalized result line",
    );
  const resultLine =
    lines[0] ??
    fail("CAPABILITY_REPORT_INVALID", "normalized result line is missing");
  return validateSummary(
    parseJson(
      resultLine.slice(prefix.length),
      "CAPABILITY_REPORT_INVALID",
      "result line",
    ),
  );
};

export const scanForInvalidTestMarkers = (
  contents: string,
): InvalidTestMarker[] => {
  const patterns: Record<InvalidTestMarker, RegExp> = {
    skip: /(?:\.skip\s*\(|\b(?:skip|skipped)["']?\s*[:=]\s*(?:true|[1-9]))/iu,
    fixme: /(?:\.fixme\s*\(|\bfixme["']?\s*[:=]\s*(?:true|[1-9]))/iu,
    todo: /(?:\.todo\s*\(|\btodo["']?\s*[:=]\s*(?:true|[1-9]))/iu,
    passWithNoTests: /\bpassWithNoTests["']?\s*[:=]\s*true/iu,
  };
  return INVALID_TEST_MARKERS.filter((marker) =>
    patterns[marker].test(contents),
  );
};

export interface Evidence {
  schema_version: 1;
  milestone: Milestone;
  cap_id: string;
  commit_sha: string;
  base_sha: string;
  contract_sha: string;
  fixture_sha: string;
  config_sha: string;
  environment: {
    platform: string;
    arch: string;
    node_version: string;
    ci: boolean;
  };
  started_at: string;
  finished_at: string;
  command: RunCommand;
  fixture_version: string;
  passed: number;
  failed: number;
  skipped: number;
  invalid_test_markers: InvalidTestMarker[];
  exit_code: number;
  raw_report: { path: string; sha256: string };
  p0: number;
  p1: number;
  implementer_ids: string[];
}

const evidenceKeys = [
  "schema_version",
  "milestone",
  "cap_id",
  "commit_sha",
  "base_sha",
  "contract_sha",
  "fixture_sha",
  "config_sha",
  "environment",
  "started_at",
  "finished_at",
  "command",
  "fixture_version",
  "passed",
  "failed",
  "skipped",
  "invalid_test_markers",
  "exit_code",
  "raw_report",
  "p0",
  "p1",
  "implementer_ids",
] as const;

export const validateEvidence = (value: unknown): Evidence => {
  if (
    isRecord(value) &&
    Array.isArray(value.invalid_test_markers) &&
    value.invalid_test_markers.length > 0
  ) {
    fail("REQUIRED_TEST_INVALID", "evidence contains a forbidden test marker");
  }
  const code = "EVIDENCE_SCHEMA_INVALID";
  const evidence = requireRecord(value, code, "evidence");
  assertExactKeys(evidence, evidenceKeys, code, "evidence");
  if (evidence.schema_version !== 1) fail(code, "schema_version must be 1");
  const milestone = validateMilestone(evidence.milestone, code);
  const capId = requireString(evidence.cap_id, code, "cap_id");
  if (!/^CAP-[A-Z]+-[0-9]{3}$/.test(capId))
    fail(code, "cap_id has an invalid format");
  const environment = requireRecord(evidence.environment, code, "environment");
  assertExactKeys(
    environment,
    ["platform", "arch", "node_version", "ci"],
    code,
    "environment",
  );
  if (typeof environment.ci !== "boolean")
    fail(code, "environment.ci must be boolean");
  const startedAt = requireIsoDate(evidence.started_at, code, "started_at");
  const finishedAt = requireIsoDate(evidence.finished_at, code, "finished_at");
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    fail(code, "finished_at precedes started_at");
  const markerValues = requireUniqueStrings(
    evidence.invalid_test_markers,
    code,
    "invalid_test_markers",
    true,
  );
  if (
    markerValues.some(
      (marker) => !(INVALID_TEST_MARKERS as readonly string[]).includes(marker),
    )
  ) {
    fail(code, "invalid_test_markers contains an unknown value");
  }
  const rawReport = requireRecord(evidence.raw_report, code, "raw_report");
  assertExactKeys(rawReport, ["path", "sha256"], code, "raw_report");
  const result: Evidence = {
    schema_version: 1,
    milestone,
    cap_id: capId,
    commit_sha: requireSha(
      evidence.commit_sha,
      code,
      "commit_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    base_sha: requireSha(
      evidence.base_sha,
      code,
      "base_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    contract_sha: requireSha(
      evidence.contract_sha,
      code,
      "contract_sha",
      /^[a-f0-9]{64}$/,
    ),
    fixture_sha: requireSha(
      evidence.fixture_sha,
      code,
      "fixture_sha",
      /^[a-f0-9]{64}$/,
    ),
    config_sha: requireSha(
      evidence.config_sha,
      code,
      "config_sha",
      /^[a-f0-9]{64}$/,
    ),
    environment: {
      platform: requireString(
        environment.platform,
        code,
        "environment.platform",
      ),
      arch: requireString(environment.arch, code, "environment.arch"),
      node_version: requireString(
        environment.node_version,
        code,
        "environment.node_version",
      ),
      ci: environment.ci as boolean,
    },
    started_at: startedAt,
    finished_at: finishedAt,
    command: validateCommand(evidence.command, code),
    fixture_version: requireString(
      evidence.fixture_version,
      code,
      "fixture_version",
    ),
    passed: requireInteger(evidence.passed, code, "passed"),
    failed: requireInteger(evidence.failed, code, "failed"),
    skipped: requireInteger(evidence.skipped, code, "skipped"),
    invalid_test_markers: markerValues as InvalidTestMarker[],
    exit_code: Number.isSafeInteger(evidence.exit_code)
      ? (evidence.exit_code as number)
      : fail(code, "exit_code must be an integer"),
    raw_report: {
      path: requireString(rawReport.path, code, "raw_report.path"),
      sha256: requireSha(
        rawReport.sha256,
        code,
        "raw_report.sha256",
        /^[a-f0-9]{64}$/,
      ),
    },
    p0: requireInteger(evidence.p0, code, "p0"),
    p1: requireInteger(evidence.p1, code, "p1"),
    implementer_ids: requireUniqueStrings(
      evidence.implementer_ids,
      code,
      "implementer_ids",
    ),
  };
  if (
    result.passed === 0 ||
    result.failed > 0 ||
    result.skipped > 0 ||
    result.invalid_test_markers.length > 0
  ) {
    fail(
      "REQUIRED_TEST_INVALID",
      "required tests must have passes and zero failures/skips/markers",
    );
  }
  if (result.exit_code !== 0)
    fail("CAPABILITY_COMMAND_FAILED", `exit_code=${result.exit_code}`);
  if (result.p0 > 0 || result.p1 > 0)
    fail("QUALITY_FINDING_PRESENT", `p0=${result.p0} p1=${result.p1}`);
  return result;
};

export const rawReportPath = (
  commitSha: string,
  milestone: Milestone,
  capId: string,
): string =>
  `artifacts/evidence/${commitSha}/raw/${milestone}/${capId}.raw.json`;

export const evidencePath = (
  commitSha: string,
  milestone: Milestone,
  capId: string,
): string =>
  `artifacts/evidence/${commitSha}/capabilities/${milestone}/${capId}.evidence.json`;

export const reviewPath = (
  commitSha: string,
  milestone: Milestone,
  dimension?: string,
): string => {
  if (dimension !== undefined && !/^[a-z0-9-]+$/.test(dimension)) {
    fail(
      "CLI_ARGUMENT_INVALID",
      "dimension must contain lowercase letters, digits, or hyphens",
    );
  }
  return `artifacts/evidence/${commitSha}/reviews/${milestone}${dimension === undefined ? "" : `-${dimension}`}-review.json`;
};

export const checklistPath = (
  commitSha: string,
  milestone: Milestone,
  dimension?: string,
): string =>
  `artifacts/evidence/${commitSha}/reviews/${milestone}${dimension === undefined ? "" : `-${dimension}`}-checklist.json`;

export const assembleEvidence = async (
  root: string,
  milestone: Milestone,
  context: CurrentContext,
  manifest: CapabilityManifest,
  item: CapabilityManifestItem,
  execution: SpawnResult,
): Promise<Evidence> => {
  if (canonicalJson(execution.command) !== canonicalJson(item.command)) {
    fail(
      "EVIDENCE_SCOPE_MISMATCH",
      `${item.cap_id} command differs from the manifest`,
    );
  }
  const rawPath = rawReportPath(context.commit_sha, milestone, item.cap_id);
  const rawSha = await writeEvidenceFile(root, rawPath, {
    schema_version: 1,
    ...execution,
  });
  if (execution.exit_code !== 0)
    fail(
      "CAPABILITY_COMMAND_FAILED",
      `${item.cap_id} exit_code=${execution.exit_code}`,
    );
  const detectedMarkers = scanForInvalidTestMarkers(
    `${execution.stdout}\n${execution.stderr}`,
  );
  const summary = parseCapabilitySummary(execution.stdout);
  const markers = [
    ...new Set([...detectedMarkers, ...summary.invalid_test_markers]),
  ];
  const evidence: Evidence = {
    schema_version: 1,
    milestone,
    cap_id: item.cap_id,
    ...context,
    environment: {
      platform: platform(),
      arch: arch(),
      node_version: process.version,
      ci: process.env.CI === "true",
    },
    started_at: execution.started_at,
    finished_at: execution.finished_at,
    command: execution.command,
    fixture_version: summary.fixture_version,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    invalid_test_markers: markers,
    exit_code: execution.exit_code,
    raw_report: { path: rawPath, sha256: rawSha },
    p0: summary.p0,
    p1: summary.p1,
    implementer_ids: [...item.implementer_ids],
  };
  if (summary.fixture_version !== manifest.fixture_version) {
    fail(
      "CAPABILITY_REPORT_INVALID",
      "fixture version does not match the manifest",
    );
  }
  validateEvidence(evidence);
  await writeEvidenceFile(
    root,
    evidencePath(context.commit_sha, milestone, item.cap_id),
    evidence,
  );
  return evidence;
};

export const assembleEvidenceFromRawReport = async (
  root: string,
  milestone: Milestone,
  capId: string,
  rawPath: string,
): Promise<Evidence> => {
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  const item =
    manifest.required_caps.find((candidate) => candidate.cap_id === capId) ??
    fail(
      "REQUIRED_SCOPE_MISMATCH",
      `${capId} is not required for ${milestone}`,
    );
  const contents = await readEvidenceFile(root, rawPath);
  const execution = validateRawReport(
    parseJson(
      Buffer.from(contents).toString("utf8"),
      "RAW_REPORT_INVALID",
      rawPath,
    ),
  );
  return await assembleEvidence(
    root,
    milestone,
    context,
    manifest,
    item,
    execution,
  );
};

const loadMilestoneInputs = async (
  root: string,
  milestone: Milestone,
): Promise<{ manifest: CapabilityManifest; context: CurrentContext }> => {
  const config = await loadGateConfig(root);
  const milestoneConfig = config.milestones[milestone];
  validateOracle(
    await readJson(
      root,
      milestoneConfig.oracle_path,
      "ORACLE_INTEGRITY_FAILURE",
    ),
    milestone,
  );
  const manifest = validateManifest(
    await readJson(
      root,
      milestoneConfig.manifest_path,
      "MANIFEST_SCHEMA_INVALID",
    ),
    milestone,
  );
  return { manifest, context: await computeCurrentContext(root, milestone) };
};

export const runCapability = async (
  root: string,
  milestone: Milestone,
  capId: string,
  options: { clock?: () => Date; environment?: NodeJS.ProcessEnv } = {},
): Promise<Evidence> => {
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  const item =
    manifest.required_caps.find((candidate) => candidate.cap_id === capId) ??
    fail(
      "REQUIRED_SCOPE_MISMATCH",
      `${capId} is not required for ${milestone}`,
    );
  const commandOptions: ExecuteCommandOptions = {};
  if (options.clock !== undefined) commandOptions.clock = options.clock;
  if (options.environment !== undefined)
    commandOptions.environment = options.environment;
  const execution = await executeCommand(root, item.command, commandOptions);
  return await assembleEvidence(
    root,
    milestone,
    context,
    manifest,
    item,
    execution,
  );
};

const sameStringArray = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const verifyEvidence = async (
  root: string,
  unknownEvidence: unknown,
  context: CurrentContext,
  manifest: CapabilityManifest,
  item: CapabilityManifestItem,
): Promise<Evidence> => {
  const evidence = validateEvidence(unknownEvidence);
  for (const field of [
    "commit_sha",
    "contract_sha",
    "fixture_sha",
    "config_sha",
  ] as const) {
    if (evidence[field] !== context[field])
      fail("STALE_EVIDENCE", `${item.cap_id} ${field}`);
  }
  if (
    evidence.base_sha !== context.base_sha ||
    evidence.milestone !== manifest.milestone ||
    evidence.cap_id !== item.cap_id ||
    evidence.fixture_version !== manifest.fixture_version ||
    canonicalJson(evidence.command) !== canonicalJson(item.command) ||
    !sameStringArray(evidence.implementer_ids, item.implementer_ids)
  ) {
    fail("EVIDENCE_SCOPE_MISMATCH", item.cap_id);
  }
  const exactRawPath = rawReportPath(
    context.commit_sha,
    manifest.milestone,
    item.cap_id,
  );
  if (evidence.raw_report.path !== exactRawPath) {
    fail("EVIDENCE_PATH_INVALID", evidence.raw_report.path);
  }
  const rawContents = await readEvidenceFile(root, evidence.raw_report.path);
  if (sha256(rawContents) !== evidence.raw_report.sha256) {
    fail("RAW_REPORT_HASH_MISMATCH", evidence.raw_report.path);
  }
  const raw = validateRawReport(
    parseJson(
      Buffer.from(rawContents).toString("utf8"),
      "RAW_REPORT_INVALID",
      evidence.raw_report.path,
    ),
  );
  if (
    raw.exit_code !== evidence.exit_code ||
    canonicalJson(raw.command) !== canonicalJson(evidence.command) ||
    raw.started_at !== evidence.started_at ||
    raw.finished_at !== evidence.finished_at
  ) {
    fail("RAW_REPORT_INVALID", evidence.raw_report.path);
  }
  const summary = parseCapabilitySummary(raw.stdout);
  const rawMarkers = [
    ...new Set([
      ...scanForInvalidTestMarkers(`${raw.stdout}\n${raw.stderr}`),
      ...summary.invalid_test_markers,
    ]),
  ];
  if (
    summary.fixture_version !== evidence.fixture_version ||
    summary.passed !== evidence.passed ||
    summary.failed !== evidence.failed ||
    summary.skipped !== evidence.skipped ||
    summary.p0 !== evidence.p0 ||
    summary.p1 !== evidence.p1 ||
    !sameStringArray(rawMarkers, evidence.invalid_test_markers)
  ) {
    fail(
      "RAW_REPORT_INVALID",
      "normalized raw result does not match evidence counters",
    );
  }
  return evidence;
};

export interface TrustedReviewerIdentity {
  reviewer_id: string;
  source: { provider: "github-actions"; actor: string; actor_id: string };
}

export type TrustedReviewerIdentityProvider = () => TrustedReviewerIdentity;

export const resolveTrustedReviewerIdentity = (
  environment: NodeJS.ProcessEnv = process.env,
): TrustedReviewerIdentity => {
  if (environment.GITHUB_ACTIONS !== "true") {
    fail(
      "TRUSTED_REVIEWER_IDENTITY_REQUIRED",
      "review recording is restricted to GitHub Actions",
    );
  }
  const actor = environment.GITHUB_ACTOR;
  const actorId = environment.GITHUB_ACTOR_ID;
  if (
    actor === undefined ||
    !/^[A-Za-z0-9-]+$/.test(actor) ||
    actorId === undefined ||
    !/^[0-9]+$/.test(actorId)
  ) {
    fail(
      "TRUSTED_REVIEWER_IDENTITY_REQUIRED",
      "GitHub actor identity is incomplete",
    );
  }
  const trustedActor = actor as string;
  const trustedActorId = actorId as string;
  return {
    reviewer_id: `github:${trustedActorId}`,
    source: {
      provider: "github-actions",
      actor: trustedActor,
      actor_id: trustedActorId,
    },
  };
};

export interface Review {
  schema_version: 1;
  milestone: Milestone;
  commit_sha: string;
  contract_sha: string;
  fixture_sha: string;
  config_sha: string;
  reviewer_id: string;
  reviewer_source: TrustedReviewerIdentity["source"];
  reviewed_at: string;
  p0: number;
  p1: number;
  implementer_ids: string[];
  checklist: { path: string; sha256: string };
  signature: {
    method: "github-actions-identity-v1";
    signed_by: string;
    statement_sha256: string;
  };
}

const reviewKeys = [
  "schema_version",
  "milestone",
  "commit_sha",
  "contract_sha",
  "fixture_sha",
  "config_sha",
  "reviewer_id",
  "reviewer_source",
  "reviewed_at",
  "p0",
  "p1",
  "implementer_ids",
  "checklist",
  "signature",
] as const;

export const reviewStatementSha = (review: Omit<Review, "signature">): string =>
  sha256(`HUOQIU-REVIEW-ATTESTATION\0v1\0${canonicalJson(review)}`);

const unsignedReview = (review: Review): Omit<Review, "signature"> => ({
  schema_version: review.schema_version,
  milestone: review.milestone,
  commit_sha: review.commit_sha,
  contract_sha: review.contract_sha,
  fixture_sha: review.fixture_sha,
  config_sha: review.config_sha,
  reviewer_id: review.reviewer_id,
  reviewer_source: review.reviewer_source,
  reviewed_at: review.reviewed_at,
  p0: review.p0,
  p1: review.p1,
  implementer_ids: review.implementer_ids,
  checklist: review.checklist,
});

export const validateReview = (value: unknown): Review => {
  if (
    isRecord(value) &&
    typeof value.reviewer_id === "string" &&
    Array.isArray(value.implementer_ids) &&
    value.implementer_ids.includes(value.reviewer_id)
  ) {
    fail("INDEPENDENT_REVIEW_REQUIRED", "reviewer is listed as an implementer");
  }
  const code = "REVIEW_SCHEMA_INVALID";
  const review = requireRecord(value, code, "review");
  assertExactKeys(review, reviewKeys, code, "review");
  if (review.schema_version !== 1) fail(code, "schema_version must be 1");
  const source = requireRecord(review.reviewer_source, code, "reviewer_source");
  assertExactKeys(
    source,
    ["provider", "actor", "actor_id"],
    code,
    "reviewer_source",
  );
  if (source.provider !== "github-actions")
    fail(code, "reviewer_source.provider is invalid");
  const actorId = requireString(
    source.actor_id,
    code,
    "reviewer_source.actor_id",
  );
  if (!/^[0-9]+$/.test(actorId))
    fail(code, "reviewer_source.actor_id must be numeric");
  const reviewerId = requireString(review.reviewer_id, code, "reviewer_id");
  if (reviewerId !== `github:${actorId}`)
    fail(code, "reviewer_id does not match reviewer_source");
  const checklist = requireRecord(review.checklist, code, "checklist");
  assertExactKeys(checklist, ["path", "sha256"], code, "checklist");
  const signature = requireRecord(review.signature, code, "signature");
  assertExactKeys(
    signature,
    ["method", "signed_by", "statement_sha256"],
    code,
    "signature",
  );
  if (
    signature.method !== "github-actions-identity-v1" ||
    signature.signed_by !== reviewerId
  ) {
    fail(code, "signature identity is invalid");
  }
  const result: Review = {
    schema_version: 1,
    milestone: validateMilestone(review.milestone, code),
    commit_sha: requireSha(
      review.commit_sha,
      code,
      "commit_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    contract_sha: requireSha(
      review.contract_sha,
      code,
      "contract_sha",
      /^[a-f0-9]{64}$/,
    ),
    fixture_sha: requireSha(
      review.fixture_sha,
      code,
      "fixture_sha",
      /^[a-f0-9]{64}$/,
    ),
    config_sha: requireSha(
      review.config_sha,
      code,
      "config_sha",
      /^[a-f0-9]{64}$/,
    ),
    reviewer_id: reviewerId,
    reviewer_source: {
      provider: "github-actions",
      actor: requireString(source.actor, code, "reviewer_source.actor"),
      actor_id: actorId,
    },
    reviewed_at: requireIsoDate(review.reviewed_at, code, "reviewed_at"),
    p0: requireInteger(review.p0, code, "p0"),
    p1: requireInteger(review.p1, code, "p1"),
    implementer_ids: requireUniqueStrings(
      review.implementer_ids,
      code,
      "implementer_ids",
    ),
    checklist: {
      path: requireString(checklist.path, code, "checklist.path"),
      sha256: requireSha(
        checklist.sha256,
        code,
        "checklist.sha256",
        /^[a-f0-9]{64}$/,
      ),
    },
    signature: {
      method: "github-actions-identity-v1",
      signed_by: reviewerId,
      statement_sha256: requireSha(
        signature.statement_sha256,
        code,
        "signature.statement_sha256",
        /^[a-f0-9]{64}$/,
      ),
    },
  };
  if (result.implementer_ids.includes(result.reviewer_id)) {
    fail("INDEPENDENT_REVIEW_REQUIRED", "reviewer is listed as an implementer");
  }
  if (result.p0 > 0 || result.p1 > 0)
    fail("QUALITY_FINDING_PRESENT", `p0=${result.p0} p1=${result.p1}`);
  if (
    result.signature.statement_sha256 !==
    reviewStatementSha(unsignedReview(result))
  ) {
    fail("REVIEW_SIGNATURE_INVALID", "review statement digest mismatch");
  }
  return result;
};

interface Checklist {
  schema_version: 1;
  milestone: Milestone;
  commit_sha: string;
  p0: number;
  p1: number;
  findings: unknown[];
  reviewed_dimensions: string[];
}

const validateChecklist = (
  value: unknown,
  milestone: Milestone,
  commitSha: string,
): Checklist => {
  const code = "REVIEW_CHECKLIST_INVALID";
  const checklist = requireRecord(value, code, "checklist");
  assertExactKeys(
    checklist,
    [
      "schema_version",
      "milestone",
      "commit_sha",
      "p0",
      "p1",
      "findings",
      "reviewed_dimensions",
    ],
    code,
    "checklist",
  );
  if (
    checklist.schema_version !== 1 ||
    checklist.milestone !== milestone ||
    checklist.commit_sha !== commitSha
  ) {
    fail(code, "checklist context mismatch");
  }
  if (!Array.isArray(checklist.findings))
    fail(code, "findings must be an array");
  const p0 = requireInteger(checklist.p0, code, "p0");
  const p1 = requireInteger(checklist.p1, code, "p1");
  if (p0 > 0 || p1 > 0) fail("QUALITY_FINDING_PRESENT", `p0=${p0} p1=${p1}`);
  return {
    schema_version: 1,
    milestone,
    commit_sha: commitSha,
    p0,
    p1,
    findings: checklist.findings as unknown[],
    reviewed_dimensions: requireUniqueStrings(
      checklist.reviewed_dimensions,
      code,
      "reviewed_dimensions",
    ),
  };
};

const sortedImplementers = (evidence: readonly Evidence[]): string[] =>
  [...new Set(evidence.flatMap((item) => item.implementer_ids))].sort();

const loadAllEvidence = async (
  root: string,
  manifest: CapabilityManifest,
  context: CurrentContext,
): Promise<Evidence[]> => {
  const evidence: Evidence[] = [];
  for (const item of manifest.required_caps) {
    const unknownEvidence = await readEvidenceJson(
      root,
      evidencePath(context.commit_sha, manifest.milestone, item.cap_id),
      "REQUIRED_EVIDENCE_MISSING",
    );
    evidence.push(
      await verifyEvidence(root, unknownEvidence, context, manifest, item),
    );
  }
  return evidence;
};

const verifyReview = async (
  root: string,
  review: Review,
  milestone: Milestone,
  context: CurrentContext,
  implementerIds: string[],
): Promise<void> => {
  for (const field of [
    "commit_sha",
    "contract_sha",
    "fixture_sha",
    "config_sha",
  ] as const) {
    if (review[field] !== context[field])
      fail("STALE_EVIDENCE", `review ${field}`);
  }
  if (review.milestone !== milestone)
    fail("REVIEW_SCOPE_MISMATCH", "review milestone mismatch");
  if (!sameStringArray(review.implementer_ids, implementerIds)) {
    fail("REVIEW_SCOPE_MISMATCH", "review implementer set mismatch");
  }
  const expectedChecklistPath = checklistPath(context.commit_sha, milestone);
  if (review.checklist.path !== expectedChecklistPath) {
    fail(
      "EVIDENCE_PATH_INVALID",
      `review checklist must equal ${expectedChecklistPath}`,
    );
  }
  const checklistContents = await readEvidenceFile(root, review.checklist.path);
  if (sha256(checklistContents) !== review.checklist.sha256) {
    fail("RAW_REPORT_HASH_MISMATCH", review.checklist.path);
  }
  validateChecklist(
    parseJson(
      Buffer.from(checklistContents).toString("utf8"),
      "REVIEW_CHECKLIST_INVALID",
      review.checklist.path,
    ),
    milestone,
    context.commit_sha,
  );
};

export const recordReview = async (
  root: string,
  milestone: Milestone,
  commitSha: string,
  options: {
    dimension?: string;
    identityProvider?: TrustedReviewerIdentityProvider;
    clock?: () => Date;
  } = {},
): Promise<Review> => {
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  if (commitSha !== context.commit_sha)
    fail("STALE_EVIDENCE", "record-review only accepts current HEAD");
  const evidence = await loadAllEvidence(root, manifest, context);
  const implementerIds = sortedImplementers(evidence);
  const identity = (
    options.identityProvider ?? resolveTrustedReviewerIdentity
  )();
  if (implementerIds.includes(identity.reviewer_id)) {
    fail("INDEPENDENT_REVIEW_REQUIRED", "reviewer is listed as an implementer");
  }
  const checklistRelativePath = checklistPath(
    context.commit_sha,
    milestone,
    options.dimension,
  );
  const checklistContents = await readEvidenceFile(root, checklistRelativePath);
  const checklist = validateChecklist(
    parseJson(
      Buffer.from(checklistContents).toString("utf8"),
      "REVIEW_CHECKLIST_INVALID",
      checklistRelativePath,
    ),
    milestone,
    context.commit_sha,
  );
  const unsigned: Omit<Review, "signature"> = {
    schema_version: 1,
    milestone,
    commit_sha: context.commit_sha,
    contract_sha: context.contract_sha,
    fixture_sha: context.fixture_sha,
    config_sha: context.config_sha,
    reviewer_id: identity.reviewer_id,
    reviewer_source: identity.source,
    reviewed_at: (options.clock ?? (() => new Date()))().toISOString(),
    p0: checklist.p0,
    p1: checklist.p1,
    implementer_ids: implementerIds,
    checklist: {
      path: checklistRelativePath,
      sha256: sha256(checklistContents),
    },
  };
  const review: Review = {
    ...unsigned,
    signature: {
      method: "github-actions-identity-v1",
      signed_by: identity.reviewer_id,
      statement_sha256: reviewStatementSha(unsigned),
    },
  };
  validateReview(review);
  await writeEvidenceFile(
    root,
    reviewPath(context.commit_sha, milestone, options.dimension),
    review,
  );
  return review;
};

export const runGate = async (
  root: string,
  milestone: Milestone,
  options: {
    executeCapabilities?: boolean;
    clock?: () => Date;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> => {
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  if (options.executeCapabilities !== false) {
    for (const item of manifest.required_caps) {
      const commandOptions: ExecuteCommandOptions = {};
      if (options.clock !== undefined) commandOptions.clock = options.clock;
      if (options.environment !== undefined)
        commandOptions.environment = options.environment;
      const execution = await executeCommand(
        root,
        item.command,
        commandOptions,
      );
      await assembleEvidence(
        root,
        milestone,
        context,
        manifest,
        item,
        execution,
      );
    }
  }
  const evidence = await loadAllEvidence(root, manifest, context);
  const unknownReview = await readEvidenceJson(
    root,
    reviewPath(context.commit_sha, milestone),
    "INDEPENDENT_REVIEW_REQUIRED",
  );
  if (isRecord(unknownReview)) {
    for (const field of [
      "commit_sha",
      "contract_sha",
      "fixture_sha",
      "config_sha",
    ] as const) {
      if (unknownReview[field] !== context[field])
        fail("STALE_EVIDENCE", `review ${field}`);
    }
  }
  const review = validateReview(unknownReview);
  await verifyReview(
    root,
    review,
    milestone,
    context,
    sortedImplementers(evidence),
  );
  const totals = evidence.reduce(
    (current, item) => ({
      failed: current.failed + item.failed,
      skipped: current.skipped + item.skipped,
      p0: current.p0 + item.p0,
      p1: current.p1 + item.p1,
    }),
    { failed: 0, skipped: 0, p0: review.p0, p1: review.p1 },
  );
  if (Object.values(totals).some((value) => value !== 0)) {
    fail("GATE_FAILED", canonicalJson(totals));
  }
  return milestone === "d0"
    ? "D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0"
    : "M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0";
};

export const writeChecklistForTesting = async (
  root: string,
  milestone: Milestone,
  commitSha: string,
  dimensions: string[],
): Promise<void> => {
  await writeEvidenceFile(root, checklistPath(commitSha, milestone), {
    schema_version: 1,
    milestone,
    commit_sha: commitSha,
    p0: 0,
    p1: 0,
    findings: [],
    reviewed_dimensions: dimensions,
  });
};

export const loadInputsForTesting = loadMilestoneInputs;
export const writeEvidenceFileForTesting = writeEvidenceFile;
