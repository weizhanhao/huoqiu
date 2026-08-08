import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { watch as watchFiles, type FSWatcher } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
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
  "quality/evidence/authorship.schema.json",
  "quality/evidence/evidence.schema.json",
  "quality/evidence/review.schema.json",
  "quality/reviewers/trust-registry.schema.json",
  "quality/reviewers/trust-registry.v2.json",
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

const requirePatternString = (
  value: unknown,
  code: string,
  label: string,
  pattern: RegExp,
): string => {
  const text = requireString(value, code, label);
  if (!pattern.test(text)) fail(code, `${label} has an invalid format`);
  return text;
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
  "powershell.exe",
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
  const executableBasename = executable
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.toLowerCase();
  if (
    /\s/.test(executable) ||
    executableBasename === undefined ||
    FORBIDDEN_EXECUTABLES.has(executableBasename)
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

const PENDING_IMPLEMENTER_ID = "pending:capability-implementation";

// This inventory is verifier code, not candidate-controlled manifest data.
// Removing a capability from the approved pending set therefore requires a
// reviewed verifier release and a matching protected oracle update.
const EXPECTED_PENDING_CAP_IDS: Record<Milestone, readonly string[]> = {
  d0: [...D0_REQUIRED_CAP_IDS],
  m1: [...M1_REQUIRED_CAP_IDS],
};

const pendingCapabilityCommand = (capId: string): RunCommand => ({
  executable: "pnpm",
  args: [
    "exec",
    "tsx",
    "scripts/quality/not-implemented-gate.mts",
    "--cap",
    capId,
  ],
});

const isCanonicalIdentity = (value: string): boolean =>
  /^github:[1-9][0-9]*$/.test(value);

const isPendingCapability = (item: CapabilityManifestItem): boolean =>
  item.implementer_ids.length === 1 &&
  item.implementer_ids[0] === PENDING_IMPLEMENTER_ID &&
  canonicalJson(item.command) ===
    canonicalJson(pendingCapabilityCommand(item.cap_id));

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
      const command = validateCommand(item.command, code);
      const implementerIds = requireUniqueStrings(
        item.implementer_ids,
        code,
        `required_caps[${index}].implementer_ids`,
      );
      const candidate = {
        cap_id: capId,
        command,
        implementer_ids: implementerIds,
      };
      const hasPendingIdentity = implementerIds.includes(
        PENDING_IMPLEMENTER_ID,
      );
      if (
        (hasPendingIdentity && !isPendingCapability(candidate)) ||
        (!hasPendingIdentity && !implementerIds.every(isCanonicalIdentity))
      ) {
        fail(
          code,
          `required_caps[${index}].implementer_ids must be canonical GitHub IDs or the exact pending sentinel command`,
        );
      }
      if (
        hasPendingIdentity &&
        !EXPECTED_PENDING_CAP_IDS[milestone].includes(capId)
      ) {
        fail(code, `${capId} is not approved for pending status`);
      }
      return candidate;
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
  assertExactKeys(
    oracle,
    ["milestone", "required_cap_ids", "pending_cap_ids"],
    code,
    "oracle",
  );
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
  const pending = requireUniqueStrings(
    oracle.pending_cap_ids,
    code,
    "oracle.pending_cap_ids",
    true,
  );
  if (
    canonicalJson(pending) !==
    canonicalJson(EXPECTED_PENDING_CAP_IDS[milestone])
  ) {
    fail(
      code,
      "oracle does not match the independently approved pending CAP IDs and order",
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
  const rootStat = await lstat(rootAbsolute).catch(() =>
    fail(code, "repository root cannot be inspected"),
  );
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(code, "repository root must be a real directory");
  }
  const rootReal = await realpath(rootAbsolute);
  const assertContained = (candidate: string): void => {
    const relativeReal = relative(rootReal, candidate);
    if (
      relativeReal === ".." ||
      relativeReal.startsWith(`..${sep}`) ||
      isAbsolute(relativeReal)
    ) {
      fail(code, `${toPosix(relativePath)} resolves outside the repository`);
    }
  };
  let cursor = rootAbsolute;
  const segments = relativePath.split(sep);
  for (const [index, segment] of segments.entries()) {
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
        index <= segments.length - 1
      ) {
        assertContained(await realpath(dirname(cursor)));
        return;
      }
      if (error instanceof QualityGateError) throw error;
      throw error;
    }
  }
  assertContained(await realpath(absolute));
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
  await assertNoSymlinkSegments(root, absolute, false, "GATE_INPUT_INVALID");
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
      await assertNoSymlinkSegments(
        root,
        absolute,
        false,
        "GATE_INPUT_INVALID",
      );
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
    const absolute = safeRepositoryPath(root, path, "GATE_INPUT_INVALID");
    await assertNoSymlinkSegments(root, absolute, false, "GATE_INPUT_INVALID");
    const contents = await readFile(absolute);
    await assertNoSymlinkSegments(root, absolute, false, "GATE_INPUT_INVALID");
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
  source_tree_sha256: string;
  contract_sha: string;
  fixture_sha: string;
  config_sha: string;
}

const assertContextStillCurrent = async (
  root: string,
  milestone: Milestone,
  expected: CurrentContext,
): Promise<void> => {
  let current: CurrentContext;
  try {
    current = await computeCurrentContext(root, milestone);
  } catch (error) {
    if (error instanceof QualityGateError) {
      fail("CONTEXT_CHANGED_DURING_EXECUTION", error.message);
    }
    throw error;
  }
  for (const field of [
    "commit_sha",
    "base_sha",
    "source_tree_sha256",
    "contract_sha",
    "fixture_sha",
    "config_sha",
  ] as const) {
    if (current[field] !== expected[field]) {
      fail("CONTEXT_CHANGED_DURING_EXECUTION", field);
    }
  }
};

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
  if (signal !== null) fail(code, "accepted raw report signal must be null");
  return {
    command: validateCommand(raw.command, code),
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: requireSignedInteger(raw.exit_code, code, "exit_code"),
    signal: null,
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
    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { shell: false, stdio: "ignore", windowsHide: true },
      );
      killer.on("error", () => child.kill("SIGKILL"));
      killer.unref();
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
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

const runGitRaw = async (root: string, args: string[]): Promise<string> => {
  const result = await executeCommand(root, { executable: "git", args });
  if (result.exit_code !== 0)
    fail("GIT_CONTEXT_UNAVAILABLE", result.stderr.trim());
  return result.stdout;
};

const runGit = async (root: string, args: string[]): Promise<string> =>
  (await runGitRaw(root, args)).trim();

interface TrackedSourceSnapshot {
  sha256: string;
  paths: string[];
}

export const computeTrackedSourceSnapshot = async (
  root: string,
): Promise<TrackedSourceSnapshot> => {
  const flagged = (await runGitRaw(root, ["ls-files", "-v", "-z"]))
    .split("\0")
    .filter(Boolean)
    .filter((record) => {
      const status = record[0];
      return status === "S" || (status !== undefined && /^[a-z]$/.test(status));
    });
  if (flagged.length > 0) {
    fail(
      "INDEX_FLAG_FORBIDDEN",
      "assume-unchanged and skip-worktree flags are forbidden for certification",
    );
  }
  const records = (await runGitRaw(root, ["ls-files", "--stage", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (records.length === 0)
    fail("GIT_CONTEXT_UNAVAILABLE", "repository has no tracked files");
  const entries = records.map((record) => {
    const match =
      /^([0-7]{6}) [a-f0-9]{40,64} ([0-3])\t([\s\S]+)$/u.exec(record) ??
      fail("GIT_CONTEXT_UNAVAILABLE", "tracked index entry is malformed");
    const mode = match[1] as string;
    const stage = match[2] as string;
    const path = toPosix(
      match[3] ??
        fail("GIT_CONTEXT_UNAVAILABLE", "tracked index path is missing"),
    );
    if (stage !== "0") fail("DIRTY_WORKTREE", "unmerged index entry");
    if (mode !== "100644" && mode !== "100755")
      fail("GATE_INPUT_INVALID", `${path} is not a regular tracked file`);
    safeRepositoryPath(root, path, "GATE_INPUT_INVALID");
    return { mode, path };
  });
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const hash = createHash("sha256");
  hash.update("HUOQIU-TRACKED-SOURCE\0v1\0");
  for (const entry of entries) {
    const absolute = safeRepositoryPath(root, entry.path, "GATE_INPUT_INVALID");
    await assertNoSymlinkSegments(root, absolute, false, "GATE_INPUT_INVALID");
    const contents = await readFile(absolute);
    hash.update("MODE\0");
    hash.update(entry.mode);
    hash.update("\0PATH\0");
    hash.update(entry.path);
    hash.update("\0SIZE\0");
    hash.update(String(contents.byteLength));
    hash.update("\0CONTENT\0");
    hash.update(contents);
    hash.update("\0END\0");
  }
  return { sha256: hash.digest("hex"), paths: entries.map(({ path }) => path) };
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
  const sourceSnapshot = await computeTrackedSourceSnapshot(root);
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
    source_tree_sha256: sourceSnapshot.sha256,
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
    skip: /(?:\.(?:skip|skipIf)\s*\(|\b(?:xit|xdescribe)\s*\(|\b(?:skip|skipped)["']?\s*[:=]\s*(?:true|[1-9])|\b[1-9][0-9]*\s+(?:tests?\s+)?skipped\b|\[\s*skipped\s*\]|<skipped(?:\s|\/>|>)|#\s*SKIP\b|---\s+SKIP:)/iu,
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
  source_tree_sha256: string;
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
  "source_tree_sha256",
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
    source_tree_sha256: requireSha(
      evidence.source_tree_sha256,
      code,
      "source_tree_sha256",
      /^[a-f0-9]{64}$/,
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
  if (!result.implementer_ids.every(isCanonicalIdentity))
    fail(code, "implementer_ids must be canonical GitHub identities");
  if (
    result.raw_report.path !==
    rawReportPath(result.commit_sha, result.milestone, result.cap_id)
  ) {
    fail(code, "raw_report.path does not match evidence context");
  }
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
  if (isPendingCapability(item)) {
    fail(
      "NOT_IMPLEMENTED",
      `${item.cap_id} has no certifiable implementation evidence yet`,
    );
  }
  await assertContextStillCurrent(root, milestone, context);
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
  void root;
  void milestone;
  void capId;
  void rawPath;
  return fail(
    "UNTRUSTED_RAW_REPORT",
    "caller-supplied raw reports cannot establish an immutable execution snapshot",
  );
};

const loadMilestoneDefinition = async (
  root: string,
  milestone: Milestone,
): Promise<CapabilityManifest> => {
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
  return manifest;
};

const loadMilestoneInputs = async (
  root: string,
  milestone: Milestone,
): Promise<{ manifest: CapabilityManifest; context: CurrentContext }> => {
  const manifest = await loadMilestoneDefinition(root, milestone);
  return { manifest, context: await computeCurrentContext(root, milestone) };
};

const executeInDetachedSnapshot = async (
  root: string,
  context: CurrentContext,
  command: RunCommand,
  options: ExecuteCommandOptions,
): Promise<SpawnResult> => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "huoqiu-snapshot-"));
  const snapshotRoot = resolve(temporaryParent, "worktree");
  let added = false;
  const watchers: FSWatcher[] = [];
  let trackedWrite = false;
  try {
    const add = await executeCommand(root, {
      executable: "git",
      args: ["worktree", "add", "--detach", snapshotRoot, context.commit_sha],
    });
    if (add.exit_code !== 0)
      fail("SNAPSHOT_PREPARATION_FAILED", add.stderr.trim());
    added = true;
    const before = await computeTrackedSourceSnapshot(snapshotRoot);
    if (before.sha256 !== context.source_tree_sha256)
      fail("SNAPSHOT_PREPARATION_FAILED", "detached source digest mismatch");
    const tracked = new Set(before.paths);
    const directories = new Set(before.paths.map((path) => dirname(path)));
    for (const directory of directories) {
      const watcher = watchFiles(
        resolve(snapshotRoot, directory),
        (event, name) => {
          if (event !== "change" && event !== "rename") return;
          if (name === null) {
            trackedWrite = true;
            return;
          }
          const changed = toPosix(
            relative(
              snapshotRoot,
              resolve(snapshotRoot, directory, String(name)),
            ),
          );
          if (
            tracked.has(changed) ||
            [...tracked].some((path) => path.startsWith(`${changed}/`))
          ) {
            trackedWrite = true;
          }
        },
      );
      watcher.on("error", () => {
        trackedWrite = true;
      });
      watchers.push(watcher);
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 20));
    const hasPackage = before.paths.includes("package.json");
    const hasLockfile = before.paths.includes("pnpm-lock.yaml");
    if (hasPackage || hasLockfile) {
      if (!hasPackage || !hasLockfile)
        fail(
          "SNAPSHOT_PREPARATION_FAILED",
          "package and lockfile must coexist",
        );
      const install = await executeCommand(snapshotRoot, {
        executable: "pnpm",
        args: [
          "install",
          "--offline",
          "--frozen-lockfile",
          "--strict-peer-dependencies",
        ],
      });
      if (install.exit_code !== 0)
        fail("SNAPSHOT_PREPARATION_FAILED", install.stderr.trim());
    }
    const execution = await executeCommand(snapshotRoot, command, options);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
    const after = await computeTrackedSourceSnapshot(snapshotRoot);
    if (trackedWrite || after.sha256 !== before.sha256)
      fail(
        "CONTEXT_CHANGED_DURING_EXECUTION",
        "tracked source was written inside the execution snapshot",
      );
    return execution;
  } finally {
    for (const watcher of watchers) watcher.close();
    if (added) {
      await executeCommand(root, {
        executable: "git",
        args: ["worktree", "remove", "--force", snapshotRoot],
      }).catch(() => undefined);
    }
    await rm(temporaryParent, { recursive: true, force: true });
  }
};

export const runCapability = async (
  root: string,
  milestone: Milestone,
  capId: string,
  options: { clock?: () => Date; environment?: NodeJS.ProcessEnv } = {},
): Promise<Evidence> => {
  const manifest = await loadMilestoneDefinition(root, milestone);
  const item =
    manifest.required_caps.find((candidate) => candidate.cap_id === capId) ??
    fail(
      "REQUIRED_SCOPE_MISMATCH",
      `${capId} is not required for ${milestone}`,
    );
  if (isPendingCapability(item)) {
    fail(
      "NOT_IMPLEMENTED",
      `${item.cap_id} has no certifiable implementation evidence yet`,
    );
  }
  const context = await computeCurrentContext(root, milestone);
  const commandOptions: ExecuteCommandOptions = {};
  if (options.clock !== undefined) commandOptions.clock = options.clock;
  if (options.environment !== undefined)
    commandOptions.environment = options.environment;
  const execution = await executeInDetachedSnapshot(
    root,
    context,
    item.command,
    commandOptions,
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
): Promise<{ evidence: Evidence; rawContents: Uint8Array }> => {
  const evidence = validateEvidence(unknownEvidence);
  for (const field of [
    "commit_sha",
    "source_tree_sha256",
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
  return { evidence, rawContents };
};

export interface ReviewerProvenance {
  provider: "github-actions";
  actor: string;
  actor_id: string;
  repository: string;
  repository_id: string;
  workflow_ref: string;
  workflow_sha: string;
  ref: string;
  ref_protected: true;
  event_name: string;
  run_id: string;
  run_attempt: string;
  job: string;
  protected_environment: string;
}

export interface TrustedReviewerIdentity {
  reviewer_id: string;
  source: ReviewerProvenance;
}

const REVIEW_ACTOR_PATTERN = /^[A-Za-z0-9-]+$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_REF_PATTERN =
  /^[^\0\r\n]+\/\.github\/workflows\/[^\0\r\n]+@refs\/[^\0\r\n]+$/;
const PROTECTED_REF_PATTERN = /^refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+$/;
const EVENT_PATTERN = /^[A-Za-z0-9_]+$/;
const SAFE_PROVENANCE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

const requiredEnvironmentValue = (
  environment: NodeJS.ProcessEnv,
  name: string,
  pattern: RegExp,
): string => {
  const value = environment[name];
  if (value === undefined || !pattern.test(value)) {
    fail("TRUSTED_REVIEWER_IDENTITY_REQUIRED", `${name} is missing or invalid`);
  }
  return value as string;
};

export const resolveTrustedReviewerIdentity = (
  environment: NodeJS.ProcessEnv = process.env,
): TrustedReviewerIdentity => {
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_REF_PROTECTED !== "true"
  ) {
    fail(
      "TRUSTED_REVIEWER_IDENTITY_REQUIRED",
      "review recording requires a protected GitHub Actions ref",
    );
  }
  const actor = requiredEnvironmentValue(
    environment,
    "GITHUB_ACTOR",
    REVIEW_ACTOR_PATTERN,
  );
  const actorId = requiredEnvironmentValue(
    environment,
    "GITHUB_ACTOR_ID",
    POSITIVE_DECIMAL_PATTERN,
  );
  return {
    reviewer_id: `github:${actorId}`,
    source: {
      provider: "github-actions",
      actor,
      actor_id: actorId,
      repository: requiredEnvironmentValue(
        environment,
        "GITHUB_REPOSITORY",
        REPOSITORY_PATTERN,
      ),
      repository_id: requiredEnvironmentValue(
        environment,
        "GITHUB_REPOSITORY_ID",
        POSITIVE_DECIMAL_PATTERN,
      ),
      workflow_ref: requiredEnvironmentValue(
        environment,
        "GITHUB_WORKFLOW_REF",
        WORKFLOW_REF_PATTERN,
      ),
      workflow_sha: requiredEnvironmentValue(
        environment,
        "GITHUB_WORKFLOW_SHA",
        /^[a-f0-9]{40}$/,
      ),
      ref: requiredEnvironmentValue(
        environment,
        "GITHUB_REF",
        PROTECTED_REF_PATTERN,
      ),
      ref_protected: true,
      event_name: requiredEnvironmentValue(
        environment,
        "GITHUB_EVENT_NAME",
        EVENT_PATTERN,
      ),
      run_id: requiredEnvironmentValue(
        environment,
        "GITHUB_RUN_ID",
        POSITIVE_DECIMAL_PATTERN,
      ),
      run_attempt: requiredEnvironmentValue(
        environment,
        "GITHUB_RUN_ATTEMPT",
        POSITIVE_DECIMAL_PATTERN,
      ),
      job: requiredEnvironmentValue(
        environment,
        "GITHUB_JOB",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
      protected_environment: requiredEnvironmentValue(
        environment,
        "HUOQIU_REVIEW_ENVIRONMENT",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
    },
  };
};

interface TrustPolicy {
  subject_id: string;
  roles: ("review" | "authorship")[];
  actor: string;
  actor_id: string;
  repository: string;
  repository_id: string;
  workflow_ref: string;
  workflow_sha: string;
  ref: string;
  event_name: string;
  protected_environment: string;
  public_key_spki_pem: string;
}

interface TrustRegistry {
  schema_version: 2;
  trust_domain: "huoqiu-quality";
  repository_id: string;
  epoch: number;
  previous_registry_sha256: string | null;
  expires_at: string;
  verifier_sha256: string;
  keys: Record<string, TrustPolicy>;
  signature: {
    algorithm: "Ed25519";
    key_id: string;
    value_base64: string;
  } | null;
}

interface LoadedTrustRegistry {
  registry: TrustRegistry;
  sha256: string;
  verifierRootKeyId: string;
}

const TRUST_REGISTRY_PATH = "quality/reviewers/trust-registry.v2.json";

const validateTrustRegistry = (value: unknown): TrustRegistry => {
  const code = "REVIEW_TRUST_REGISTRY_INVALID";
  const registry = requireRecord(value, code, "trust registry");
  assertExactKeys(
    registry,
    [
      "schema_version",
      "trust_domain",
      "repository_id",
      "epoch",
      "previous_registry_sha256",
      "expires_at",
      "verifier_sha256",
      "keys",
      "signature",
    ],
    code,
    "trust registry",
  );
  if (registry.schema_version !== 2) fail(code, "schema_version must be 2");
  if (registry.trust_domain !== "huoqiu-quality")
    fail(code, "trust_domain must be huoqiu-quality");
  const epoch = requireInteger(registry.epoch, code, "epoch");
  if (epoch < 1) fail(code, "epoch must be positive");
  const previousRegistrySha256 =
    registry.previous_registry_sha256 === null
      ? null
      : requireSha(
          registry.previous_registry_sha256,
          code,
          "previous_registry_sha256",
          /^[a-f0-9]{64}$/,
        );
  if ((epoch === 1) !== (previousRegistrySha256 === null))
    fail(code, "only epoch 1 may omit previous_registry_sha256");
  const repositoryId = requirePatternString(
    registry.repository_id,
    code,
    "repository_id",
    POSITIVE_DECIMAL_PATTERN,
  );
  const unknownKeys = requireRecord(registry.keys, code, "trust registry keys");
  const keys: Record<string, TrustPolicy> = {};
  for (const [keyId, unknownPolicy] of Object.entries(unknownKeys)) {
    if (!/^ed25519:[a-f0-9]{64}$/.test(keyId)) fail(code, "invalid key ID");
    const policy = requireRecord(unknownPolicy, code, `keys.${keyId}`);
    const policyKeys = [
      "subject_id",
      "roles",
      "actor",
      "actor_id",
      "repository",
      "repository_id",
      "workflow_ref",
      "workflow_sha",
      "ref",
      "event_name",
      "protected_environment",
      "public_key_spki_pem",
    ] as const;
    assertExactKeys(policy, policyKeys, code, `keys.${keyId}`);
    const actorId = requirePatternString(
      policy.actor_id,
      code,
      `${keyId}.actor_id`,
      POSITIVE_DECIMAL_PATTERN,
    );
    const subjectId = requireString(
      policy.subject_id,
      code,
      `${keyId}.subject_id`,
    );
    if (subjectId !== `github:${actorId}`)
      fail(code, `${keyId} subject identity is not canonical`);
    const roles = requireUniqueStrings(policy.roles, code, `${keyId}.roles`);
    if (!roles.every((role) => role === "review" || role === "authorship"))
      fail(code, `${keyId} has an invalid role`);
    const publicKeyPem = requireString(
      policy.public_key_spki_pem,
      code,
      `${keyId}.public_key_spki_pem`,
    );
    const publicKey = (() => {
      try {
        return createPublicKey(publicKeyPem);
      } catch {
        return fail(code, `${keyId} public key is invalid`);
      }
    })();
    if (publicKey.asymmetricKeyType !== "ed25519")
      fail(code, `${keyId} key must be Ed25519`);
    const derivedKeyId = `ed25519:${sha256(
      publicKey.export({ format: "der", type: "spki" }),
    )}`;
    if (derivedKeyId !== keyId)
      fail(code, `${keyId} does not match its public key`);
    const repository = requirePatternString(
      policy.repository,
      code,
      `${keyId}.repository`,
      REPOSITORY_PATTERN,
    );
    const policyRepositoryId = requirePatternString(
      policy.repository_id,
      code,
      `${keyId}.repository_id`,
      POSITIVE_DECIMAL_PATTERN,
    );
    if (policyRepositoryId !== repositoryId)
      fail(code, `${keyId} repository ID does not match the registry`);
    const workflowRef = requirePatternString(
      policy.workflow_ref,
      code,
      `${keyId}.workflow_ref`,
      WORKFLOW_REF_PATTERN,
    );
    if (!workflowRef.startsWith(`${repository}/.github/workflows/`))
      fail(code, `${keyId} workflow repository does not match its policy`);
    keys[keyId] = {
      subject_id: subjectId,
      roles: roles as TrustPolicy["roles"],
      actor: requirePatternString(
        policy.actor,
        code,
        `${keyId}.actor`,
        REVIEW_ACTOR_PATTERN,
      ),
      actor_id: actorId,
      repository,
      repository_id: policyRepositoryId,
      workflow_ref: workflowRef,
      workflow_sha: requireSha(
        policy.workflow_sha,
        code,
        `${keyId}.workflow_sha`,
        /^[a-f0-9]{40}$/,
      ),
      ref: requirePatternString(
        policy.ref,
        code,
        `${keyId}.ref`,
        PROTECTED_REF_PATTERN,
      ),
      event_name: requirePatternString(
        policy.event_name,
        code,
        `${keyId}.event_name`,
        EVENT_PATTERN,
      ),
      protected_environment: requirePatternString(
        policy.protected_environment,
        code,
        `${keyId}.protected_environment`,
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
      public_key_spki_pem: publicKeyPem,
    };
  }
  let signature: TrustRegistry["signature"] = null;
  if (registry.signature !== null) {
    const unknownSignature = requireRecord(
      registry.signature,
      code,
      "signature",
    );
    assertExactKeys(
      unknownSignature,
      ["algorithm", "key_id", "value_base64"],
      code,
      "signature",
    );
    if (unknownSignature.algorithm !== "Ed25519")
      fail(code, "signature algorithm must be Ed25519");
    const signatureValue = requireString(
      unknownSignature.value_base64,
      code,
      "signature.value_base64",
    );
    const signatureBytes = Buffer.from(signatureValue, "base64");
    if (
      signatureBytes.byteLength !== 64 ||
      signatureBytes.toString("base64") !== signatureValue
    ) {
      fail(code, "registry signature is not canonical Ed25519 bytes");
    }
    signature = {
      algorithm: "Ed25519",
      key_id: requireSha(
        unknownSignature.key_id,
        code,
        "signature.key_id",
        /^ed25519:[a-f0-9]{64}$/,
      ),
      value_base64: signatureValue,
    };
  }
  return {
    schema_version: 2,
    trust_domain: "huoqiu-quality",
    repository_id: repositoryId,
    epoch,
    previous_registry_sha256: previousRegistrySha256,
    expires_at: requireIsoDate(registry.expires_at, code, "expires_at"),
    verifier_sha256: requireSha(
      registry.verifier_sha256,
      code,
      "verifier_sha256",
      /^[a-f0-9]{64}$/,
    ),
    keys,
    signature,
  };
};

const unsignedTrustRegistry = (
  registry: TrustRegistry,
): Omit<TrustRegistry, "signature"> => ({
  schema_version: registry.schema_version,
  trust_domain: registry.trust_domain,
  repository_id: registry.repository_id,
  epoch: registry.epoch,
  previous_registry_sha256: registry.previous_registry_sha256,
  expires_at: registry.expires_at,
  verifier_sha256: registry.verifier_sha256,
  keys: registry.keys,
});

const trustRegistrySigningBytes = (registry: TrustRegistry): Uint8Array =>
  Buffer.from(
    `HUOQIU-TRUST-REGISTRY\0v2\0${canonicalJson(unsignedTrustRegistry(registry))}`,
    "utf8",
  );

const verifierRoot = (
  environment: NodeJS.ProcessEnv,
): { keyId: string; publicKey: ReturnType<typeof createPublicKey> } => {
  const encoded =
    environment.HUOQIU_VERIFIER_ROOT_PUBLIC_KEY_SPKI_B64 ??
    fail(
      "VERIFIER_TRUST_ROOT_REQUIRED",
      "protected verifier root SPKI and key ID are required",
    );
  const expectedKeyId =
    environment.HUOQIU_VERIFIER_ROOT_KEY_ID ??
    fail(
      "VERIFIER_TRUST_ROOT_REQUIRED",
      "protected verifier root SPKI and key ID are required",
    );
  const der = Buffer.from(encoded, "base64");
  if (der.toString("base64") !== encoded)
    fail("VERIFIER_TRUST_ROOT_REQUIRED", "root SPKI is not canonical base64");
  const publicKey = (() => {
    try {
      return createPublicKey({ key: der, format: "der", type: "spki" });
    } catch {
      return fail("VERIFIER_TRUST_ROOT_REQUIRED", "root SPKI is invalid");
    }
  })();
  if (publicKey.asymmetricKeyType !== "ed25519")
    fail("VERIFIER_TRUST_ROOT_REQUIRED", "root key must be Ed25519");
  const keyId = `ed25519:${sha256(der)}`;
  if (keyId !== expectedKeyId)
    fail("VERIFIER_TRUST_ROOT_REQUIRED", "root key ID does not match SPKI");
  return { keyId, publicKey };
};

const loadTrustRegistry = async (
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<LoadedTrustRegistry> => {
  const rootAnchor = verifierRoot(environment);
  const absolute = safeRepositoryPath(
    root,
    TRUST_REGISTRY_PATH,
    "REVIEW_TRUST_REGISTRY_INVALID",
  );
  try {
    await assertNoSymlinkSegments(
      root,
      absolute,
      false,
      "REVIEW_TRUST_REGISTRY_INVALID",
    );
    const contents = await readFile(absolute);
    const registry = validateTrustRegistry(
      parseJson(
        Buffer.from(contents).toString("utf8"),
        "REVIEW_TRUST_REGISTRY_INVALID",
        TRUST_REGISTRY_PATH,
      ),
    );
    const signature =
      registry.signature ??
      fail("REVIEW_TRUST_REQUIRED", "trust registry is not root-signed");
    if (signature.key_id !== rootAnchor.keyId)
      fail("REVIEW_TRUST_REGISTRY_INVALID", "registry root key ID mismatch");
    const verified = verifyBytes(
      null,
      trustRegistrySigningBytes(registry),
      rootAnchor.publicKey,
      Buffer.from(signature.value_base64, "base64"),
    );
    if (!verified)
      fail("REVIEW_TRUST_REGISTRY_INVALID", "registry root signature invalid");
    const expectedRepositoryId = environment.HUOQIU_REPOSITORY_ID;
    const expectedVerifierSha = environment.HUOQIU_VERIFIER_SHA256;
    const expectedEpoch = environment.HUOQIU_TRUST_REGISTRY_EPOCH;
    if (
      expectedRepositoryId === undefined ||
      expectedVerifierSha === undefined ||
      expectedEpoch === undefined ||
      !POSITIVE_DECIMAL_PATTERN.test(expectedEpoch) ||
      registry.repository_id !== expectedRepositoryId ||
      registry.verifier_sha256 !== expectedVerifierSha ||
      String(registry.epoch) !== expectedEpoch
    ) {
      fail(
        "VERIFIER_TRUST_ROOT_REQUIRED",
        "protected repository, verifier, and registry epoch pins are missing or mismatched",
      );
    }
    if (Date.parse(registry.expires_at) <= Date.now())
      fail("REVIEW_TRUST_REGISTRY_INVALID", "trust registry has expired");
    return {
      registry,
      sha256: sha256(contents),
      verifierRootKeyId: rootAnchor.keyId,
    };
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    return fail(
      "REVIEW_TRUST_REGISTRY_INVALID",
      "trust registry cannot be read",
    );
  }
};

const policyMatchesIdentity = (
  policy: TrustPolicy,
  identity: TrustedReviewerIdentity,
  role: TrustPolicy["roles"][number],
): boolean => {
  const source = identity.source;
  return (
    policy.subject_id === identity.reviewer_id &&
    policy.roles.includes(role) &&
    policy.actor === source.actor &&
    policy.actor_id === source.actor_id &&
    policy.repository === source.repository &&
    policy.repository_id === source.repository_id &&
    policy.workflow_ref === source.workflow_ref &&
    policy.workflow_sha === source.workflow_sha &&
    policy.ref === source.ref &&
    policy.event_name === source.event_name &&
    policy.protected_environment === source.protected_environment
  );
};

export interface AuthorshipAttestation {
  schema_version: 1;
  repository_id: string;
  trusted_base_sha: string;
  head_sha: string;
  head_tree_oid: string;
  canonical_diff_sha256: string;
  source_tree_sha256: string;
  trust_registry_sha256: string;
  derivation_policy_version: "external-attestor-v1";
  attestor_input_sha256: string;
  implementer_ids: string[];
  issued_at: string;
  issuer_id: string;
  issuer_source: ReviewerProvenance;
  signature: {
    algorithm: "Ed25519";
    key_id: string;
    value_base64: string;
  };
}

export const authorshipPath = (commitSha: string): string =>
  `artifacts/evidence/${commitSha}/authorship.v1.json`;

const authorshipKeys = [
  "schema_version",
  "repository_id",
  "trusted_base_sha",
  "head_sha",
  "head_tree_oid",
  "canonical_diff_sha256",
  "source_tree_sha256",
  "trust_registry_sha256",
  "derivation_policy_version",
  "attestor_input_sha256",
  "implementer_ids",
  "issued_at",
  "issuer_id",
  "issuer_source",
  "signature",
] as const;

const unsignedAuthorship = (
  attestation: AuthorshipAttestation,
): Omit<AuthorshipAttestation, "signature"> => ({
  schema_version: attestation.schema_version,
  repository_id: attestation.repository_id,
  trusted_base_sha: attestation.trusted_base_sha,
  head_sha: attestation.head_sha,
  head_tree_oid: attestation.head_tree_oid,
  canonical_diff_sha256: attestation.canonical_diff_sha256,
  source_tree_sha256: attestation.source_tree_sha256,
  trust_registry_sha256: attestation.trust_registry_sha256,
  derivation_policy_version: attestation.derivation_policy_version,
  attestor_input_sha256: attestation.attestor_input_sha256,
  implementer_ids: attestation.implementer_ids,
  issued_at: attestation.issued_at,
  issuer_id: attestation.issuer_id,
  issuer_source: attestation.issuer_source,
});

const authorshipSigningBytes = (
  attestation: Omit<AuthorshipAttestation, "signature">,
): Uint8Array =>
  Buffer.from(`HUOQIU-AUTHORSHIP\0v1\0${canonicalJson(attestation)}`, "utf8");

const validateAuthorship = (value: unknown): AuthorshipAttestation => {
  const code = "AUTHORSHIP_ATTESTATION_INVALID";
  const attestation = requireRecord(value, code, "authorship attestation");
  assertExactKeys(attestation, authorshipKeys, code, "authorship attestation");
  if (attestation.schema_version !== 1) fail(code, "schema_version must be 1");
  if (attestation.derivation_policy_version !== "external-attestor-v1")
    fail(code, "unsupported derivation policy");
  const source = requireRecord(
    attestation.issuer_source,
    code,
    "issuer_source",
  );
  assertExactKeys(source, reviewerSourceKeys, code, "issuer_source");
  if (source.provider !== "github-actions" || source.ref_protected !== true)
    fail(code, "issuer_source provider/protection is invalid");
  const actorId = requirePatternString(
    source.actor_id,
    code,
    "issuer_source.actor_id",
    POSITIVE_DECIMAL_PATTERN,
  );
  const issuerId = requireString(attestation.issuer_id, code, "issuer_id");
  if (issuerId !== `github:${actorId}`)
    fail(code, "issuer identity is not canonical");
  const signature = requireRecord(attestation.signature, code, "signature");
  assertExactKeys(
    signature,
    ["algorithm", "key_id", "value_base64"],
    code,
    "signature",
  );
  if (signature.algorithm !== "Ed25519")
    fail(code, "signature algorithm is invalid");
  const signatureBase64 = requireString(
    signature.value_base64,
    code,
    "signature.value_base64",
  );
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  if (
    signatureBytes.byteLength !== 64 ||
    signatureBytes.toString("base64") !== signatureBase64
  ) {
    fail(code, "signature.value_base64 is not canonical Ed25519 bytes");
  }
  const implementerIds = requireUniqueStrings(
    attestation.implementer_ids,
    code,
    "implementer_ids",
  );
  if (!implementerIds.every(isCanonicalIdentity))
    fail(code, "implementer_ids must be canonical GitHub identities");
  return {
    schema_version: 1,
    repository_id: requirePatternString(
      attestation.repository_id,
      code,
      "repository_id",
      POSITIVE_DECIMAL_PATTERN,
    ),
    trusted_base_sha: requireSha(
      attestation.trusted_base_sha,
      code,
      "trusted_base_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    head_sha: requireSha(
      attestation.head_sha,
      code,
      "head_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    head_tree_oid: requireSha(
      attestation.head_tree_oid,
      code,
      "head_tree_oid",
      /^[a-f0-9]{40,64}$/,
    ),
    canonical_diff_sha256: requireSha(
      attestation.canonical_diff_sha256,
      code,
      "canonical_diff_sha256",
      /^[a-f0-9]{64}$/,
    ),
    source_tree_sha256: requireSha(
      attestation.source_tree_sha256,
      code,
      "source_tree_sha256",
      /^[a-f0-9]{64}$/,
    ),
    trust_registry_sha256: requireSha(
      attestation.trust_registry_sha256,
      code,
      "trust_registry_sha256",
      /^[a-f0-9]{64}$/,
    ),
    derivation_policy_version: "external-attestor-v1",
    attestor_input_sha256: requireSha(
      attestation.attestor_input_sha256,
      code,
      "attestor_input_sha256",
      /^[a-f0-9]{64}$/,
    ),
    implementer_ids: implementerIds,
    issued_at: requireIsoDate(attestation.issued_at, code, "issued_at"),
    issuer_id: issuerId,
    issuer_source: {
      provider: "github-actions",
      actor: requirePatternString(
        source.actor,
        code,
        "issuer_source.actor",
        REVIEW_ACTOR_PATTERN,
      ),
      actor_id: actorId,
      repository: requirePatternString(
        source.repository,
        code,
        "issuer_source.repository",
        REPOSITORY_PATTERN,
      ),
      repository_id: requirePatternString(
        source.repository_id,
        code,
        "issuer_source.repository_id",
        POSITIVE_DECIMAL_PATTERN,
      ),
      workflow_ref: requirePatternString(
        source.workflow_ref,
        code,
        "issuer_source.workflow_ref",
        WORKFLOW_REF_PATTERN,
      ),
      workflow_sha: requireSha(
        source.workflow_sha,
        code,
        "issuer_source.workflow_sha",
        /^[a-f0-9]{40}$/,
      ),
      ref: requirePatternString(
        source.ref,
        code,
        "issuer_source.ref",
        PROTECTED_REF_PATTERN,
      ),
      ref_protected: true,
      event_name: requirePatternString(
        source.event_name,
        code,
        "issuer_source.event_name",
        EVENT_PATTERN,
      ),
      run_id: requirePatternString(
        source.run_id,
        code,
        "issuer_source.run_id",
        POSITIVE_DECIMAL_PATTERN,
      ),
      run_attempt: requirePatternString(
        source.run_attempt,
        code,
        "issuer_source.run_attempt",
        POSITIVE_DECIMAL_PATTERN,
      ),
      job: requirePatternString(
        source.job,
        code,
        "issuer_source.job",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
      protected_environment: requirePatternString(
        source.protected_environment,
        code,
        "issuer_source.protected_environment",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
    },
    signature: {
      algorithm: "Ed25519",
      key_id: requireSha(
        signature.key_id,
        code,
        "signature.key_id",
        /^ed25519:[a-f0-9]{64}$/,
      ),
      value_base64: signatureBase64,
    },
  };
};

const canonicalDiffSha256 = async (
  root: string,
  trustedBaseSha: string,
  headSha: string,
): Promise<string> => {
  const ancestry = await executeCommand(root, {
    executable: "git",
    args: ["merge-base", "--is-ancestor", trustedBaseSha, headSha],
  });
  if (ancestry.exit_code !== 0)
    fail("AUTHORSHIP_ATTESTATION_INVALID", "trusted base is not an ancestor");
  const diff = await runGitRaw(root, [
    "diff",
    "--binary",
    "--full-index",
    "--no-ext-diff",
    `${trustedBaseSha}..${headSha}`,
    "--",
  ]);
  return sha256(`HUOQIU-CANONICAL-DIFF\0v1\0${diff}`);
};

const signingPrivateKey = (
  environment: NodeJS.ProcessEnv,
  name: string,
  code: string,
): ReturnType<typeof createPrivateKey> => {
  const encoded = environment[name] ?? fail(code, `${name} is missing`);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) fail(code, `${name} is malformed`);
  const key = (() => {
    try {
      return createPrivateKey(bytes);
    } catch {
      return fail(code, `${name} is invalid`);
    }
  })();
  if (key.asymmetricKeyType !== "ed25519") fail(code, "key must be Ed25519");
  return key;
};

const assertPrivateKeyMatchesPolicy = (
  privateKey: ReturnType<typeof createPrivateKey>,
  policy: TrustPolicy,
  code: string,
): void => {
  const derived = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });
  const registered = createPublicKey(policy.public_key_spki_pem).export({
    format: "der",
    type: "spki",
  });
  if (!Buffer.from(derived).equals(Buffer.from(registered)))
    fail(code, "private key does not match the registry");
};

export const recordAuthorship = async (
  root: string,
  commitSha: string,
  implementerIdsInput: string[],
  options: {
    milestone?: Milestone;
    environment?: NodeJS.ProcessEnv;
    clock?: () => Date;
  } = {},
): Promise<AuthorshipAttestation> => {
  const environment = options.environment ?? process.env;
  const context = await computeCurrentContext(root, options.milestone ?? "d0");
  if (context.commit_sha !== commitSha)
    fail(
      "AUTHORSHIP_ATTESTATION_INVALID",
      "authorship only accepts current HEAD",
    );
  const implementerIds = requireUniqueStrings(
    implementerIdsInput,
    "AUTHORSHIP_ATTESTATION_INVALID",
    "implementer_ids",
  ).sort();
  if (!implementerIds.every(isCanonicalIdentity))
    fail("AUTHORSHIP_ATTESTATION_INVALID", "implementer IDs are not canonical");
  const registry = await loadTrustRegistry(root, environment);
  const identity = resolveTrustedReviewerIdentity(environment);
  if (implementerIds.includes(identity.reviewer_id))
    fail(
      "INDEPENDENT_REVIEW_REQUIRED",
      "authorship attestor is listed as an implementer",
    );
  const { keyId, policy } = policyForKey(
    registry.registry,
    environment.HUOQIU_AUTHORSHIP_KEY_ID,
  );
  if (!policyMatchesIdentity(policy, identity, "authorship"))
    fail(
      "AUTHORSHIP_ATTESTATION_INVALID",
      "authorship provenance is unauthorized",
    );
  const trustedBaseSha = requireSha(
    environment.HUOQIU_TRUSTED_BASE_SHA,
    "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
    "HUOQIU_TRUSTED_BASE_SHA",
    /^[a-f0-9]{40,64}$/,
  );
  const attestorInputSha = requireSha(
    environment.HUOQIU_AUTHORSHIP_INPUT_SHA256,
    "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
    "HUOQIU_AUTHORSHIP_INPUT_SHA256",
    /^[a-f0-9]{64}$/,
  );
  if (environment.HUOQIU_AUTHORSHIP_POLICY_VERSION !== "external-attestor-v1")
    fail(
      "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
      "authorship policy is not pinned",
    );
  const headTreeOid = await runGit(root, ["rev-parse", `${commitSha}^{tree}`]);
  const unsigned: Omit<AuthorshipAttestation, "signature"> = {
    schema_version: 1,
    repository_id: registry.registry.repository_id,
    trusted_base_sha: trustedBaseSha,
    head_sha: commitSha,
    head_tree_oid: headTreeOid,
    canonical_diff_sha256: await canonicalDiffSha256(
      root,
      trustedBaseSha,
      commitSha,
    ),
    source_tree_sha256: context.source_tree_sha256,
    trust_registry_sha256: registry.sha256,
    derivation_policy_version: "external-attestor-v1",
    attestor_input_sha256: attestorInputSha,
    implementer_ids: implementerIds,
    issued_at: (options.clock ?? (() => new Date()))().toISOString(),
    issuer_id: identity.reviewer_id,
    issuer_source: identity.source,
  };
  // Candidate commands are never executed after this protected secret is loaded.
  const privateKey = signingPrivateKey(
    environment,
    "HUOQIU_AUTHORSHIP_PRIVATE_KEY_B64",
    "AUTHORSHIP_PRIVATE_KEY_REQUIRED",
  );
  assertPrivateKeyMatchesPolicy(
    privateKey,
    policy,
    "AUTHORSHIP_PRIVATE_KEY_MISMATCH",
  );
  const attestation: AuthorshipAttestation = {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: keyId,
      value_base64: signBytes(
        null,
        authorshipSigningBytes(unsigned),
        privateKey,
      ).toString("base64"),
    },
  };
  validateAuthorship(attestation);
  await writeEvidenceFile(root, authorshipPath(commitSha), attestation);
  return attestation;
};

const verifyAuthorship = async (
  root: string,
  context: CurrentContext,
  implementerIds: string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ attestation: AuthorshipAttestation; sha256: string }> => {
  const path = authorshipPath(context.commit_sha);
  const contents = await readEvidenceFile(
    root,
    path,
    "AUTHORSHIP_ATTESTATION_REQUIRED",
  );
  const attestation = validateAuthorship(
    parseJson(
      Buffer.from(contents).toString("utf8"),
      "AUTHORSHIP_ATTESTATION_INVALID",
      path,
    ),
  );
  const registry = await loadTrustRegistry(root, environment);
  const trustedBaseSha = requireSha(
    environment.HUOQIU_TRUSTED_BASE_SHA,
    "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
    "HUOQIU_TRUSTED_BASE_SHA",
    /^[a-f0-9]{40,64}$/,
  );
  const attestorInputSha = requireSha(
    environment.HUOQIU_AUTHORSHIP_INPUT_SHA256,
    "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
    "HUOQIU_AUTHORSHIP_INPUT_SHA256",
    /^[a-f0-9]{64}$/,
  );
  if (environment.HUOQIU_AUTHORSHIP_POLICY_VERSION !== "external-attestor-v1") {
    fail(
      "AUTHORSHIP_IDENTITY_NOT_CONFIGURED",
      "protected authorship derivation pins are required",
    );
  }
  const headTreeOid = await runGit(root, [
    "rev-parse",
    `${context.commit_sha}^{tree}`,
  ]);
  if (
    attestation.repository_id !== registry.registry.repository_id ||
    attestation.trusted_base_sha !== trustedBaseSha ||
    attestation.head_sha !== context.commit_sha ||
    attestation.head_tree_oid !== headTreeOid ||
    attestation.canonical_diff_sha256 !==
      (await canonicalDiffSha256(root, trustedBaseSha, context.commit_sha)) ||
    attestation.source_tree_sha256 !== context.source_tree_sha256 ||
    attestation.trust_registry_sha256 !== registry.sha256 ||
    attestation.attestor_input_sha256 !== attestorInputSha ||
    !sameStringArray(attestation.implementer_ids, implementerIds)
  ) {
    fail(
      "AUTHORSHIP_ATTESTATION_INVALID",
      "authorship context or implementers mismatch",
    );
  }
  const { policy } = policyForKey(
    registry.registry,
    attestation.signature.key_id,
  );
  const identity: TrustedReviewerIdentity = {
    reviewer_id: attestation.issuer_id,
    source: attestation.issuer_source,
  };
  if (implementerIds.includes(identity.reviewer_id))
    fail(
      "INDEPENDENT_REVIEW_REQUIRED",
      "authorship attestor is listed as an implementer",
    );
  if (!policyMatchesIdentity(policy, identity, "authorship"))
    fail("AUTHORSHIP_ATTESTATION_INVALID", "attestor is not authorized");
  if (
    !verifyBytes(
      null,
      authorshipSigningBytes(unsignedAuthorship(attestation)),
      createPublicKey(policy.public_key_spki_pem),
      Buffer.from(attestation.signature.value_base64, "base64"),
    )
  ) {
    fail("AUTHORSHIP_ATTESTATION_INVALID", "authorship signature invalid");
  }
  return { attestation, sha256: sha256(contents) };
};

export interface Review {
  schema_version: 3;
  milestone: Milestone;
  commit_sha: string;
  base_sha: string;
  source_tree_sha256: string;
  contract_sha: string;
  fixture_sha: string;
  config_sha: string;
  trust_registry_sha256: string;
  verifier_root_key_id: string;
  authorship_attestation_sha256: string;
  evidence_set_sha256: string;
  evidence_count: number;
  latest_evidence_finished_at: string;
  reviewer_id: string;
  reviewer_source: ReviewerProvenance;
  reviewed_at: string;
  p0: number;
  p1: number;
  implementer_ids: string[];
  checklist: { path: string; sha256: string };
  signature: {
    algorithm: "Ed25519";
    key_id: string;
    value_base64: string;
  };
}

const reviewKeys = [
  "schema_version",
  "milestone",
  "commit_sha",
  "base_sha",
  "source_tree_sha256",
  "contract_sha",
  "fixture_sha",
  "config_sha",
  "trust_registry_sha256",
  "verifier_root_key_id",
  "authorship_attestation_sha256",
  "evidence_set_sha256",
  "evidence_count",
  "latest_evidence_finished_at",
  "reviewer_id",
  "reviewer_source",
  "reviewed_at",
  "p0",
  "p1",
  "implementer_ids",
  "checklist",
  "signature",
] as const;

const reviewerSourceKeys = [
  "provider",
  "actor",
  "actor_id",
  "repository",
  "repository_id",
  "workflow_ref",
  "workflow_sha",
  "ref",
  "ref_protected",
  "event_name",
  "run_id",
  "run_attempt",
  "job",
  "protected_environment",
] as const;

const unsignedReview = (review: Review): Omit<Review, "signature"> => ({
  schema_version: review.schema_version,
  milestone: review.milestone,
  commit_sha: review.commit_sha,
  base_sha: review.base_sha,
  source_tree_sha256: review.source_tree_sha256,
  contract_sha: review.contract_sha,
  fixture_sha: review.fixture_sha,
  config_sha: review.config_sha,
  trust_registry_sha256: review.trust_registry_sha256,
  verifier_root_key_id: review.verifier_root_key_id,
  authorship_attestation_sha256: review.authorship_attestation_sha256,
  evidence_set_sha256: review.evidence_set_sha256,
  evidence_count: review.evidence_count,
  latest_evidence_finished_at: review.latest_evidence_finished_at,
  reviewer_id: review.reviewer_id,
  reviewer_source: review.reviewer_source,
  reviewed_at: review.reviewed_at,
  p0: review.p0,
  p1: review.p1,
  implementer_ids: review.implementer_ids,
  checklist: review.checklist,
});

const reviewSigningBytes = (review: Omit<Review, "signature">): Uint8Array =>
  Buffer.from(`HUOQIU-QUALITY-REVIEW\0v3\0${canonicalJson(review)}`, "utf8");

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
  if (review.schema_version !== 3) fail(code, "schema_version must be 3");
  const source = requireRecord(review.reviewer_source, code, "reviewer_source");
  assertExactKeys(source, reviewerSourceKeys, code, "reviewer_source");
  if (source.provider !== "github-actions" || source.ref_protected !== true)
    fail(code, "reviewer_source provider/protection is invalid");
  const actorId = requirePatternString(
    source.actor_id,
    code,
    "reviewer_source.actor_id",
    POSITIVE_DECIMAL_PATTERN,
  );
  const reviewerId = requireString(review.reviewer_id, code, "reviewer_id");
  if (reviewerId !== `github:${actorId}`)
    fail(code, "reviewer identity is not canonical");
  const checklist = requireRecord(review.checklist, code, "checklist");
  assertExactKeys(checklist, ["path", "sha256"], code, "checklist");
  const signature = requireRecord(review.signature, code, "signature");
  assertExactKeys(
    signature,
    ["algorithm", "key_id", "value_base64"],
    code,
    "signature",
  );
  if (signature.algorithm !== "Ed25519")
    fail(code, "signature algorithm is invalid");
  const signatureBase64 = requireString(
    signature.value_base64,
    code,
    "signature.value_base64",
  );
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  if (
    signatureBytes.byteLength !== 64 ||
    signatureBytes.toString("base64") !== signatureBase64
  ) {
    fail(code, "signature.value_base64 is not canonical Ed25519 bytes");
  }
  const implementerIds = requireUniqueStrings(
    review.implementer_ids,
    code,
    "implementer_ids",
  );
  if (!implementerIds.every(isCanonicalIdentity))
    fail(code, "implementer_ids must be canonical GitHub identities");
  const result: Review = {
    schema_version: 3,
    milestone: validateMilestone(review.milestone, code),
    commit_sha: requireSha(
      review.commit_sha,
      code,
      "commit_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    base_sha: requireSha(
      review.base_sha,
      code,
      "base_sha",
      /^[a-f0-9]{40,64}$/,
    ),
    source_tree_sha256: requireSha(
      review.source_tree_sha256,
      code,
      "source_tree_sha256",
      /^[a-f0-9]{64}$/,
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
    trust_registry_sha256: requireSha(
      review.trust_registry_sha256,
      code,
      "trust_registry_sha256",
      /^[a-f0-9]{64}$/,
    ),
    verifier_root_key_id: requireSha(
      review.verifier_root_key_id,
      code,
      "verifier_root_key_id",
      /^ed25519:[a-f0-9]{64}$/,
    ),
    authorship_attestation_sha256: requireSha(
      review.authorship_attestation_sha256,
      code,
      "authorship_attestation_sha256",
      /^[a-f0-9]{64}$/,
    ),
    evidence_set_sha256: requireSha(
      review.evidence_set_sha256,
      code,
      "evidence_set_sha256",
      /^[a-f0-9]{64}$/,
    ),
    evidence_count: requireInteger(
      review.evidence_count,
      code,
      "evidence_count",
    ),
    latest_evidence_finished_at: requireIsoDate(
      review.latest_evidence_finished_at,
      code,
      "latest_evidence_finished_at",
    ),
    reviewer_id: reviewerId,
    reviewer_source: {
      provider: "github-actions",
      actor: requirePatternString(
        source.actor,
        code,
        "reviewer_source.actor",
        REVIEW_ACTOR_PATTERN,
      ),
      actor_id: actorId,
      repository: requirePatternString(
        source.repository,
        code,
        "reviewer_source.repository",
        REPOSITORY_PATTERN,
      ),
      repository_id: requirePatternString(
        source.repository_id,
        code,
        "reviewer_source.repository_id",
        POSITIVE_DECIMAL_PATTERN,
      ),
      workflow_ref: requirePatternString(
        source.workflow_ref,
        code,
        "reviewer_source.workflow_ref",
        WORKFLOW_REF_PATTERN,
      ),
      workflow_sha: requireSha(
        source.workflow_sha,
        code,
        "reviewer_source.workflow_sha",
        /^[a-f0-9]{40}$/,
      ),
      ref: requirePatternString(
        source.ref,
        code,
        "reviewer_source.ref",
        PROTECTED_REF_PATTERN,
      ),
      ref_protected: true,
      event_name: requirePatternString(
        source.event_name,
        code,
        "reviewer_source.event_name",
        EVENT_PATTERN,
      ),
      run_id: requirePatternString(
        source.run_id,
        code,
        "reviewer_source.run_id",
        POSITIVE_DECIMAL_PATTERN,
      ),
      run_attempt: requirePatternString(
        source.run_attempt,
        code,
        "reviewer_source.run_attempt",
        POSITIVE_DECIMAL_PATTERN,
      ),
      job: requirePatternString(
        source.job,
        code,
        "reviewer_source.job",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
      protected_environment: requirePatternString(
        source.protected_environment,
        code,
        "reviewer_source.protected_environment",
        SAFE_PROVENANCE_NAME_PATTERN,
      ),
    },
    reviewed_at: requireIsoDate(review.reviewed_at, code, "reviewed_at"),
    p0: requireInteger(review.p0, code, "p0"),
    p1: requireInteger(review.p1, code, "p1"),
    implementer_ids: implementerIds,
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
      algorithm: "Ed25519",
      key_id: requireSha(
        signature.key_id,
        code,
        "signature.key_id",
        /^ed25519:[a-f0-9]{64}$/,
      ),
      value_base64: signatureBase64,
    },
  };
  if (result.evidence_count === 0)
    fail(code, "evidence_count must be positive");
  if (result.implementer_ids.includes(result.reviewer_id))
    fail("INDEPENDENT_REVIEW_REQUIRED", "reviewer is listed as an implementer");
  if (result.p0 > 0 || result.p1 > 0)
    fail("QUALITY_FINDING_PRESENT", `p0=${result.p0} p1=${result.p1}`);
  return result;
};

interface Finding {
  id: string;
  severity: "P0" | "P1" | "P2" | "P3";
  summary: string;
  evidence_refs: string[];
}

interface Checklist {
  schema_version: 1;
  milestone: Milestone;
  commit_sha: string;
  p0: number;
  p1: number;
  findings: Finding[];
  reviewed_dimensions: string[];
}

const requiredReviewDimensions = (milestone: Milestone): string[] =>
  milestone === "d0"
    ? ["functional", "quality"]
    : ["functional", "quality", "security", "release"];

const expectedReviewDimension = (milestone: Milestone): string | undefined =>
  milestone === "m1" ? "release" : undefined;

const validateChecklist = (
  value: unknown,
  milestone: Milestone,
  commitSha: string,
  allowedEvidenceRefs: ReadonlySet<string>,
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
  const findings = (checklist.findings as unknown[]).map(
    (unknownFinding, index) => {
      const finding = requireRecord(unknownFinding, code, `findings[${index}]`);
      assertExactKeys(
        finding,
        ["id", "severity", "summary", "evidence_refs"],
        code,
        `findings[${index}]`,
      );
      const id = requireString(finding.id, code, `findings[${index}].id`);
      if (!/^F-[A-Z0-9][A-Z0-9-]{0,63}$/.test(id))
        fail(code, `${id} is invalid`);
      const severity = requireString(
        finding.severity,
        code,
        `findings[${index}].severity`,
      );
      if (!["P0", "P1", "P2", "P3"].includes(severity))
        fail(code, `${id} severity is invalid`);
      const summary = requireString(
        finding.summary,
        code,
        `findings[${index}].summary`,
      );
      if (summary.trim() !== summary || summary.length > 500)
        fail(code, `${id} summary is invalid`);
      const evidenceRefs = requireUniqueStrings(
        finding.evidence_refs,
        code,
        `findings[${index}].evidence_refs`,
      );
      if (!evidenceRefs.every((path) => allowedEvidenceRefs.has(path)))
        fail(code, `${id} references evidence outside this review set`);
      return {
        id,
        severity: severity as Finding["severity"],
        summary,
        evidence_refs: evidenceRefs,
      };
    },
  );
  if (new Set(findings.map((finding) => finding.id)).size !== findings.length)
    fail(code, "finding IDs must be unique");
  const p0 = requireInteger(checklist.p0, code, "p0");
  const p1 = requireInteger(checklist.p1, code, "p1");
  if (
    p0 !== findings.filter((finding) => finding.severity === "P0").length ||
    p1 !== findings.filter((finding) => finding.severity === "P1").length
  ) {
    fail(code, "P0/P1 counters do not match finding severities");
  }
  const reviewedDimensions = requireUniqueStrings(
    checklist.reviewed_dimensions,
    code,
    "reviewed_dimensions",
  );
  if (!sameStringArray(reviewedDimensions, requiredReviewDimensions(milestone)))
    fail(
      "REVIEW_DIMENSION_INVALID",
      "review dimensions do not match milestone policy",
    );
  if (p0 > 0 || p1 > 0) fail("QUALITY_FINDING_PRESENT", `p0=${p0} p1=${p1}`);
  return {
    schema_version: 1,
    milestone,
    commit_sha: commitSha,
    p0,
    p1,
    findings,
    reviewed_dimensions: reviewedDimensions,
  };
};

interface VerifiedEvidenceArtifact {
  path: string;
  contents: Uint8Array;
  rawContents: Uint8Array;
  evidence: Evidence;
}

interface EvidenceSet {
  sha256: string;
  count: number;
  latestFinishedAt: string;
}

const sortedImplementers = (
  artifacts: readonly VerifiedEvidenceArtifact[],
): string[] =>
  [
    ...new Set(
      artifacts.flatMap((artifact) => artifact.evidence.implementer_ids),
    ),
  ].sort();

const loadAllEvidence = async (
  root: string,
  manifest: CapabilityManifest,
  context: CurrentContext,
): Promise<VerifiedEvidenceArtifact[]> => {
  const artifacts: VerifiedEvidenceArtifact[] = [];
  for (const item of manifest.required_caps) {
    const path = evidencePath(
      context.commit_sha,
      manifest.milestone,
      item.cap_id,
    );
    const contents = await readEvidenceFile(
      root,
      path,
      "REQUIRED_EVIDENCE_MISSING",
    );
    const verified = await verifyEvidence(
      root,
      parseJson(
        Buffer.from(contents).toString("utf8"),
        "REQUIRED_EVIDENCE_MISSING",
        path,
      ),
      context,
      manifest,
      item,
    );
    artifacts.push({ path, contents, ...verified });
  }
  return artifacts;
};

const evidenceSet = (
  artifacts: readonly VerifiedEvidenceArtifact[],
): EvidenceSet => {
  const hash = createHash("sha256");
  hash.update("HUOQIU-EVIDENCE-SET\0v1\0");
  let latestFinishedAt = "";
  for (const artifact of artifacts) {
    const rawPath = artifact.evidence.raw_report.path;
    for (const [kind, path, contents] of [
      ["EVIDENCE", artifact.path, artifact.contents],
      ["RAW", rawPath, artifact.rawContents],
    ] as const) {
      hash.update(kind);
      hash.update("\0PATH\0");
      hash.update(path);
      hash.update("\0SIZE\0");
      hash.update(String(contents.byteLength));
      hash.update("\0CONTENT\0");
      hash.update(contents);
      hash.update("\0END\0");
    }
    if (
      latestFinishedAt === "" ||
      Date.parse(artifact.evidence.finished_at) > Date.parse(latestFinishedAt)
    ) {
      latestFinishedAt = artifact.evidence.finished_at;
    }
  }
  if (artifacts.length === 0 || latestFinishedAt === "")
    fail("REQUIRED_EVIDENCE_MISSING", "evidence set is empty");
  return {
    sha256: hash.digest("hex"),
    count: artifacts.length,
    latestFinishedAt,
  };
};

const policyForKey = (
  registry: TrustRegistry,
  keyId: string | undefined,
): { keyId: string; policy: TrustPolicy } => {
  const trustedKeyId =
    keyId ??
    fail("REVIEW_TRUST_REQUIRED", "a registered Ed25519 key ID is required");
  if (!/^ed25519:[a-f0-9]{64}$/.test(trustedKeyId))
    fail("REVIEW_TRUST_REQUIRED", "a registered Ed25519 key ID is required");
  const policy =
    registry.keys[trustedKeyId] ??
    fail("REVIEW_TRUST_REQUIRED", "review key is not registered");
  return { keyId: trustedKeyId, policy };
};

const verifyReviewSignature = (review: Review, policy: TrustPolicy): void => {
  const verified = (() => {
    try {
      return verifyBytes(
        null,
        reviewSigningBytes(unsignedReview(review)),
        createPublicKey(policy.public_key_spki_pem),
        Buffer.from(review.signature.value_base64, "base64"),
      );
    } catch {
      return false;
    }
  })();
  if (!verified)
    fail("REVIEW_SIGNATURE_INVALID", "Ed25519 verification failed");
};

const verifyReview = async (
  root: string,
  review: Review,
  milestone: Milestone,
  context: CurrentContext,
  artifacts: readonly VerifiedEvidenceArtifact[],
  environment: NodeJS.ProcessEnv,
): Promise<void> => {
  for (const field of [
    "commit_sha",
    "base_sha",
    "source_tree_sha256",
    "contract_sha",
    "fixture_sha",
    "config_sha",
  ] as const) {
    if (review[field] !== context[field])
      fail("STALE_EVIDENCE", `review ${field}`);
  }
  if (review.milestone !== milestone)
    fail("REVIEW_SCOPE_MISMATCH", "review milestone mismatch");
  const currentEvidenceSet = evidenceSet(artifacts);
  if (
    review.evidence_set_sha256 !== currentEvidenceSet.sha256 ||
    review.evidence_count !== currentEvidenceSet.count ||
    review.latest_evidence_finished_at !== currentEvidenceSet.latestFinishedAt
  ) {
    fail(
      "EVIDENCE_SET_MISMATCH",
      "review does not bind the current evidence bytes",
    );
  }
  const implementerIds = sortedImplementers(artifacts);
  if (!sameStringArray(review.implementer_ids, implementerIds))
    fail("REVIEW_SCOPE_MISMATCH", "review implementer set mismatch");
  const loadedRegistry = await loadTrustRegistry(root, environment);
  if (review.trust_registry_sha256 !== loadedRegistry.sha256)
    fail("STALE_EVIDENCE", "review trust_registry_sha256");
  if (review.verifier_root_key_id !== loadedRegistry.verifierRootKeyId)
    fail("STALE_EVIDENCE", "review verifier_root_key_id");
  const authorship = await verifyAuthorship(
    root,
    context,
    implementerIds,
    environment,
  );
  if (review.authorship_attestation_sha256 !== authorship.sha256)
    fail(
      "AUTHORSHIP_ATTESTATION_INVALID",
      "review does not bind authorship bytes",
    );
  const { policy } = policyForKey(
    loadedRegistry.registry,
    review.signature.key_id,
  );
  verifyReviewSignature(review, policy);
  if (
    authorship.attestation.issuer_id === review.reviewer_id ||
    authorship.attestation.signature.key_id === review.signature.key_id
  ) {
    fail(
      "INDEPENDENT_REVIEW_REQUIRED",
      "authorship attestor and reviewer must use distinct principals and keys",
    );
  }
  const identity: TrustedReviewerIdentity = {
    reviewer_id: review.reviewer_id,
    source: review.reviewer_source,
  };
  if (!policyMatchesIdentity(policy, identity, "review"))
    fail("REVIEW_TRUST_POLICY_MISMATCH", "signed provenance is not authorized");
  if (
    Date.parse(review.reviewed_at) <
    Date.parse(currentEvidenceSet.latestFinishedAt)
  )
    fail("REVIEW_TIME_INVALID", "review predates capability evidence");
  const expectedChecklistPath = checklistPath(
    context.commit_sha,
    milestone,
    expectedReviewDimension(milestone),
  );
  if (review.checklist.path !== expectedChecklistPath)
    fail(
      "EVIDENCE_PATH_INVALID",
      `review checklist must equal ${expectedChecklistPath}`,
    );
  const checklistContents = await readEvidenceFile(root, review.checklist.path);
  if (sha256(checklistContents) !== review.checklist.sha256)
    fail("RAW_REPORT_HASH_MISMATCH", review.checklist.path);
  validateChecklist(
    parseJson(
      Buffer.from(checklistContents).toString("utf8"),
      "REVIEW_CHECKLIST_INVALID",
      review.checklist.path,
    ),
    milestone,
    context.commit_sha,
    new Set(artifacts.map((artifact) => artifact.path)),
  );
};

export const recordReview = async (
  root: string,
  milestone: Milestone,
  commitSha: string,
  options: {
    dimension?: string;
    environment?: NodeJS.ProcessEnv;
    clock?: () => Date;
  } = {},
): Promise<Review> => {
  const expectedDimension = expectedReviewDimension(milestone);
  if (options.dimension !== expectedDimension)
    fail(
      "REVIEW_DIMENSION_INVALID",
      `${milestone} requires ${expectedDimension ?? "default"}`,
    );
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  if (commitSha !== context.commit_sha)
    fail("STALE_EVIDENCE", "record-review only accepts current HEAD");
  const artifacts = await loadAllEvidence(root, manifest, context);
  const currentEvidenceSet = evidenceSet(artifacts);
  const implementerIds = sortedImplementers(artifacts);
  const environment = options.environment ?? process.env;
  // Establish the protected root of trust before consuming any candidate
  // authorship artifact. This also makes an unconfigured registry fail closed.
  const loadedRegistry = await loadTrustRegistry(root, environment);
  const authorship = await verifyAuthorship(
    root,
    context,
    implementerIds,
    environment,
  );
  const identity = resolveTrustedReviewerIdentity(environment);
  if (authorship.attestation.issuer_id === identity.reviewer_id)
    fail(
      "INDEPENDENT_REVIEW_REQUIRED",
      "authorship attestor and reviewer must be distinct principals",
    );
  if (implementerIds.includes(identity.reviewer_id))
    fail("INDEPENDENT_REVIEW_REQUIRED", "reviewer is listed as an implementer");
  const { keyId, policy } = policyForKey(
    loadedRegistry.registry,
    environment.HUOQIU_REVIEW_KEY_ID,
  );
  if (authorship.attestation.signature.key_id === keyId)
    fail(
      "INDEPENDENT_REVIEW_REQUIRED",
      "authorship attestor and reviewer must use distinct keys",
    );
  if (!policyMatchesIdentity(policy, identity, "review"))
    fail(
      "REVIEW_TRUST_POLICY_MISMATCH",
      "workflow provenance is not authorized",
    );
  const checklistRelativePath = checklistPath(
    context.commit_sha,
    milestone,
    expectedDimension,
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
    new Set(artifacts.map((artifact) => artifact.path)),
  );
  const reviewedAt = (options.clock ?? (() => new Date()))().toISOString();
  if (Date.parse(reviewedAt) < Date.parse(currentEvidenceSet.latestFinishedAt))
    fail("REVIEW_TIME_INVALID", "review predates capability evidence");
  const unsigned: Omit<Review, "signature"> = {
    schema_version: 3,
    milestone,
    ...context,
    trust_registry_sha256: loadedRegistry.sha256,
    verifier_root_key_id: loadedRegistry.verifierRootKeyId,
    authorship_attestation_sha256: authorship.sha256,
    evidence_set_sha256: currentEvidenceSet.sha256,
    evidence_count: currentEvidenceSet.count,
    latest_evidence_finished_at: currentEvidenceSet.latestFinishedAt,
    reviewer_id: identity.reviewer_id,
    reviewer_source: identity.source,
    reviewed_at: reviewedAt,
    p0: checklist.p0,
    p1: checklist.p1,
    implementer_ids: implementerIds,
    checklist: {
      path: checklistRelativePath,
      sha256: sha256(checklistContents),
    },
  };
  // All candidate artifacts are loaded and validated before the protected
  // reviewer secret enters memory; no candidate command is run by this path.
  const privateKey = signingPrivateKey(
    environment,
    "HUOQIU_REVIEW_PRIVATE_KEY_B64",
    "REVIEW_PRIVATE_KEY_REQUIRED",
  );
  assertPrivateKeyMatchesPolicy(
    privateKey,
    policy,
    "REVIEW_PRIVATE_KEY_MISMATCH",
  );
  const review: Review = {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: keyId,
      value_base64: signBytes(
        null,
        reviewSigningBytes(unsigned),
        privateKey,
      ).toString("base64"),
    },
  };
  validateReview(review);
  verifyReviewSignature(review, policy);
  await writeEvidenceFile(
    root,
    reviewPath(context.commit_sha, milestone, expectedDimension),
    review,
  );
  return review;
};

export const runGate = async (
  root: string,
  milestone: Milestone,
  options: { environment?: NodeJS.ProcessEnv } = {},
): Promise<string> => {
  const { manifest, context } = await loadMilestoneInputs(root, milestone);
  const artifacts = await loadAllEvidence(root, manifest, context);
  const unknownReview = await readEvidenceJson(
    root,
    reviewPath(
      context.commit_sha,
      milestone,
      expectedReviewDimension(milestone),
    ),
    "INDEPENDENT_REVIEW_REQUIRED",
  );
  if (isRecord(unknownReview)) {
    for (const field of [
      "commit_sha",
      "base_sha",
      "source_tree_sha256",
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
    artifacts,
    options.environment ?? process.env,
  );
  const totals = artifacts.reduce(
    (current, artifact) => ({
      failed: current.failed + artifact.evidence.failed,
      skipped: current.skipped + artifact.evidence.skipped,
      p0: current.p0 + artifact.evidence.p0,
      p1: current.p1 + artifact.evidence.p1,
    }),
    { failed: 0, skipped: 0, p0: review.p0, p1: review.p1 },
  );
  if (Object.values(totals).some((value) => value !== 0))
    fail("GATE_FAILED", canonicalJson(totals));
  return milestone === "d0"
    ? "D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0"
    : "M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0";
};

export const writeChecklistForTesting = async (
  root: string,
  milestone: Milestone,
  commitSha: string,
  dimensions: string[],
  dimension?: string,
): Promise<void> => {
  await writeEvidenceFile(
    root,
    checklistPath(commitSha, milestone, dimension),
    {
      schema_version: 1,
      milestone,
      commit_sha: commitSha,
      p0: 0,
      p1: 0,
      findings: [],
      reviewed_dimensions: dimensions,
    },
  );
};

export const loadInputsForTesting = loadMilestoneInputs;
export const writeEvidenceFileForTesting = writeEvidenceFile;
