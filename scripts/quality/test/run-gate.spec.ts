import { execFile as execFileCallback } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { checkNoSkips } from "../check-no-skips.mts";
import {
  D0_REQUIRED_CAP_IDS,
  M1_REQUIRED_CAP_IDS,
  assertRequiredScope,
  computeCurrentContext,
  evidencePath,
  executeCommand,
  hashRepositoryInputs,
  loadInputsForTesting,
  parseCapabilitySummary,
  rawReportPath,
  recordReview,
  resolveTrustedReviewerIdentity,
  reviewPath,
  runCapability,
  runGate,
  safeRepositoryPath,
  scanForInvalidTestMarkers,
  validateEvidence,
  validateRawReport,
  validateReview,
  writeChecklistForTesting,
} from "../gate-core.mts";
import { main as notImplementedMain } from "../not-implemented-gate.mts";
import { main as recordReviewMain } from "../record-review.mts";

const execFile = promisify(execFileCallback);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoots: string[] = [];

const json = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const copyRepositoryFile = async (
  root: string,
  path: string,
): Promise<void> => {
  const destination = resolve(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(sourceRoot, path), destination);
};

const successCommand = (
  fixtureVersion: string,
): { executable: string; args: string[] } => {
  const summary = {
    fixture_version: fixtureVersion,
    passed: 7,
    failed: 0,
    skipped: 0,
    invalid_test_markers: [],
    p0: 0,
    p1: 0,
  };
  return {
    executable: process.execPath,
    args: [
      "-e",
      `console.log(${JSON.stringify(`HUOQIU_CAPABILITY_RESULT ${JSON.stringify(summary)}`)})`,
    ],
  };
};

const setupRepository = async (
  milestone: "d0" | "m1" = "d0",
): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), `huoqiu-quality-${milestone}-`));
  temporaryRoots.push(root);
  for (const path of [
    ".gitignore",
    "quality/gate-config.v1.json",
    "quality/evidence/evidence.schema.json",
    "quality/evidence/review.schema.json",
    `quality/oracles/${milestone}-required.json`,
  ]) {
    await copyRepositoryFile(root, path);
  }
  const gateConfig = await json(resolve(root, "quality/gate-config.v1.json"));
  const milestones = gateConfig.milestones as Record<
    string,
    Record<string, unknown>
  >;
  const milestoneConfig = milestones[milestone];
  if (milestoneConfig === undefined)
    throw new Error(`missing ${milestone} test config`);
  for (const input of milestoneConfig.contract_inputs as {
    kind: string;
    path: string;
  }[]) {
    if (input.kind === "directory") {
      await writeJson(resolve(root, input.path, "contract.ts"), {
        contract: milestone,
      });
    } else {
      await writeJson(resolve(root, input.path), {
        contract: milestone,
        path: input.path,
      });
    }
  }
  await writeJson(resolve(root, milestoneConfig.fixture_path as string), {
    version: `${milestone}.v1`,
    source: "huoqiu-synthetic",
  });
  const capIds = milestone === "d0" ? D0_REQUIRED_CAP_IDS : M1_REQUIRED_CAP_IDS;
  await writeJson(
    resolve(root, `quality/manifests/${milestone}-required.json`),
    {
      schema_version: 1,
      milestone,
      fixture_version: `${milestone}.v1`,
      required_caps: capIds.map((capId) => ({
        cap_id: capId,
        command: successCommand(`${milestone}.v1`),
        implementer_ids: ["github:100"],
      })),
      stretch_cap_ids: [],
    },
  );
  await execFile("git", ["init", "-q"], { cwd: root });
  await execFile("git", ["config", "user.name", "Quality Test"], { cwd: root });
  await execFile("git", ["config", "user.email", "quality@example.invalid"], {
    cwd: root,
  });
  await execFile("git", ["add", "."], { cwd: root });
  await execFile("git", ["commit", "-q", "-m", "quality fixture"], {
    cwd: root,
  });
  return root;
};

const identityProvider = () => ({
  reviewer_id: "github:200",
  source: {
    provider: "github-actions" as const,
    actor: "reviewer",
    actor_id: "200",
  },
});

const prepareReviewedGate = async (
  milestone: "d0" | "m1" = "d0",
): Promise<string> => {
  const root = await setupRepository(milestone);
  const capIds = milestone === "d0" ? D0_REQUIRED_CAP_IDS : M1_REQUIRED_CAP_IDS;
  for (const capId of capIds) await runCapability(root, milestone, capId);
  const context = await computeCurrentContext(root, milestone);
  await writeChecklistForTesting(root, milestone, context.commit_sha, [
    "functional",
    "quality",
  ]);
  await recordReview(root, milestone, context.commit_sha, { identityProvider });
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(async (root) => await rm(root, { force: true, recursive: true })),
  );
});

describe("independent required scope", () => {
  it("pins the exact D0 and M1 CAP IDs and order", () => {
    expect(D0_REQUIRED_CAP_IDS).toEqual([
      "CAP-ID-001",
      "CAP-INST-001",
      "CAP-MD-001",
      "CAP-FEED-001",
      "CAP-WATCH-001",
    ]);
    expect(M1_REQUIRED_CAP_IDS).toEqual([
      "CAP-ID-001",
      "CAP-INST-001",
      "CAP-MD-001",
      "CAP-FEED-001",
      "CAP-WATCH-001",
      "CAP-CONTENT-001",
      "CAP-SOCIAL-001",
      "CAP-NOTIF-001",
      "CAP-MOD-001",
      "CAP-PORT-001",
    ]);
  });

  it.each([
    ["empty", []],
    ["duplicate", ["CAP-ID-001", "CAP-ID-001"]],
    ["missing", ["CAP-ID-001"]],
    ["extra", [...D0_REQUIRED_CAP_IDS, "CAP-UNKNOWN-999"]],
    ["reordered", [...D0_REQUIRED_CAP_IDS].reverse()],
  ])("rejects a %s manifest", (_name, actual) => {
    expect(() => assertRequiredScope(actual, D0_REQUIRED_CAP_IDS)).toThrow(
      "REQUIRED_SCOPE_MISMATCH",
    );
  });

  it("rejects oracle tampering before accepting a matching attacker manifest", async () => {
    const root = await setupRepository();
    const oraclePath = resolve(root, "quality/oracles/d0-required.json");
    const oracle = await json(oraclePath);
    oracle.required_cap_ids = [...D0_REQUIRED_CAP_IDS, "CAP-UNKNOWN-999"];
    await writeJson(oraclePath, oracle);
    await expect(
      runGate(root, "d0", { executeCapabilities: false }),
    ).rejects.toThrow("ORACLE_INTEGRITY_FAILURE");
  });
});

describe("required test validity", () => {
  it.each([
    ["skip", "it.skip('disabled', () => {})"],
    ["fixme", "test.fixme('broken')"],
    ["todo", "test.todo('later')"],
    ["passWithNoTests", "passWithNoTests: true"],
  ])("detects the %s syntax marker", (marker, report) => {
    expect(scanForInvalidTestMarkers(report)).toContain(marker);
  });

  it("does not mistake skipped=0 for a skipped test", () => {
    const stdout = `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
      fixture_version: "d0.v1",
      passed: 1,
      failed: 0,
      skipped: 0,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    })}`;
    expect(scanForInvalidTestMarkers(stdout)).toEqual([]);
    expect(parseCapabilitySummary(stdout).skipped).toBe(0);
  });

  it("rejects a non-zero structured skipped count", () => {
    expect(() =>
      validateEvidence({
        invalid_test_markers: [],
        skipped: 1,
      }),
    ).toThrow("EVIDENCE_SCHEMA_INVALID");
    const stdout = `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
      fixture_version: "d0.v1",
      passed: 1,
      failed: 0,
      skipped: 1,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    })}`;
    expect(parseCapabilitySummary(stdout).skipped).toBe(1);
    expect(scanForInvalidTestMarkers('"skipped":1')).toEqual(["skip"]);
  });

  it("rejects all four markers in otherwise valid required evidence", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const evidence = await json(
      resolve(root, evidencePath(context.commit_sha, "d0", "CAP-ID-001")),
    );
    for (const marker of [
      "skip",
      "fixme",
      "todo",
      "passWithNoTests",
    ] as const) {
      expect(() =>
        validateEvidence({ ...evidence, invalid_test_markers: [marker] }),
      ).toThrow("REQUIRED_TEST_INVALID");
    }
  });

  it("rejects a capability whose normalized result has skipped tests", async () => {
    const root = await setupRepository();
    const manifestPath = resolve(root, "quality/manifests/d0-required.json");
    const manifest = await json(manifestPath);
    const requiredCaps = manifest.required_caps as Record<string, unknown>[];
    const skippedSummary = {
      fixture_version: "d0.v1",
      passed: 1,
      failed: 0,
      skipped: 1,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    };
    const firstCap = requiredCaps[0];
    if (firstCap === undefined) throw new Error("missing test capability");
    firstCap.command = {
      executable: process.execPath,
      args: [
        "-e",
        `console.log(${JSON.stringify(`HUOQIU_CAPABILITY_RESULT ${JSON.stringify(skippedSummary)}`)})`,
      ],
    };
    await writeJson(manifestPath, manifest);
    await execFile("git", ["add", "quality/manifests/d0-required.json"], {
      cwd: root,
    });
    await execFile("git", ["commit", "-q", "-m", "exercise skipped result"], {
      cwd: root,
    });
    await expect(runCapability(root, "d0", "CAP-ID-001")).rejects.toThrow(
      "REQUIRED_TEST_INVALID",
    );
  });

  it("check-no-skips accepts zero and rejects explicit skip syntax", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-no-skips-"));
    temporaryRoots.push(root);
    await writeFile(
      resolve(root, "pass.json"),
      '{"skipped":0,"passWithNoTests":false}\n',
    );
    await writeFile(resolve(root, "fail.txt"), "it.skip('later', () => {})\n");
    await expect(checkNoSkips(root, ["pass.json"])).resolves.toBeUndefined();
    await expect(checkNoSkips(root, ["fail.txt"])).rejects.toThrow(
      "REQUIRED_TEST_INVALID",
    );
  });
});

describe("deterministic context hashing", () => {
  it("is order independent but binds POSIX paths and bytes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-hash-"));
    temporaryRoots.push(root);
    await mkdir(resolve(root, "inputs"), { recursive: true });
    await writeFile(resolve(root, "inputs/a"), "same");
    await writeFile(resolve(root, "inputs/b"), "different");
    const first = await hashRepositoryInputs(root, "test", [
      { kind: "file", path: "inputs/b" },
      { kind: "file", path: "inputs/a" },
    ]);
    const second = await hashRepositoryInputs(root, "test", [
      { kind: "file", path: "inputs/a" },
      { kind: "file", path: "inputs/b" },
    ]);
    expect(first).toBe(second);
    await writeFile(resolve(root, "inputs/a"), "changed");
    await expect(
      hashRepositoryInputs(root, "test", [
        { kind: "file", path: "inputs/a" },
        { kind: "file", path: "inputs/b" },
      ]),
    ).resolves.not.toBe(first);
  });

  it("rejects missing required milestone inputs instead of hashing an empty set", async () => {
    const root = await setupRepository();
    await rm(resolve(root, "packages/contracts/src/d0"), {
      force: true,
      recursive: true,
    });
    await execFile("git", ["add", "-A"], { cwd: root });
    await execFile("git", ["commit", "-q", "-m", "remove required input"], {
      cwd: root,
    });
    await expect(computeCurrentContext(root, "d0")).rejects.toThrow(
      "GATE_INPUT_MISSING",
    );
  });

  it("rejects a dirty worktree so evidence always describes a committed tree", async () => {
    const root = await setupRepository();
    await writeFile(
      resolve(root, "uncommitted-input.ts"),
      "export const dirty = true;\n",
    );
    await expect(computeCurrentContext(root, "d0")).rejects.toThrow(
      "DIRTY_WORKTREE",
    );
  });
});

describe("argv-only capability execution", () => {
  it("passes metacharacters as a literal argv value and never invokes a shell", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-argv-"));
    temporaryRoots.push(root);
    const marker = resolve(root, "injected");
    const injected = `;require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`;
    const result = await executeCommand(root, {
      executable: process.execPath,
      args: ["-e", "console.log(process.argv[1])", injected],
    });
    expect(result.stdout.trim()).toBe(injected);
    await expect(readFile(marker)).rejects.toThrow();
  });

  it("terminates a hung process at the configured timeout", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-timeout-"));
    temporaryRoots.push(root);
    await expect(
      executeCommand(
        root,
        {
          executable: process.execPath,
          args: ["-e", "setInterval(() => {}, 1000)"],
        },
        { timeoutMs: 80 },
      ),
    ).rejects.toThrow("COMMAND_TIMEOUT");
  });

  it("kills a command that exceeds the combined stdout/stderr limit", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-output-"));
    temporaryRoots.push(root);
    await expect(
      executeCommand(
        root,
        {
          executable: process.execPath,
          args: ["-e", "console.log('x'.repeat(10000))"],
        },
        { maxOutputBytes: 128 },
      ),
    ).rejects.toThrow("COMMAND_OUTPUT_LIMIT");
  });
});

describe("strict evidence and review documents", () => {
  it("rejects unknown and missing evidence fields", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(
      root,
      evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    const evidence = await json(path);
    expect(() =>
      validateEvidence({ ...evidence, attacker_field: true }),
    ).toThrow("EVIDENCE_SCHEMA_INVALID");
    delete evidence.base_sha;
    expect(() => validateEvidence(evidence)).toThrow("EVIDENCE_SCHEMA_INVALID");
  });

  it("rejects unknown review fields and self review", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const review = await json(
      resolve(root, reviewPath(context.commit_sha, "d0")),
    );
    expect(() => validateReview({ ...review, attacker_field: true })).toThrow(
      "REVIEW_SCHEMA_INVALID",
    );
    expect(() =>
      validateReview({
        reviewer_id: "github:100",
        implementer_ids: ["github:100"],
      }),
    ).toThrow("INDEPENDENT_REVIEW_REQUIRED");
  });

  it.each(["command", "started_at", "finished_at", "signal"])(
    "rejects malformed raw report %s",
    (field) => {
      const raw: Record<string, unknown> = {
        schema_version: 1,
        command: { executable: "node", args: [] },
        started_at: "2026-08-08T00:00:00.000Z",
        finished_at: "2026-08-08T00:00:01.000Z",
        exit_code: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
      };
      raw[field] = field === "command" ? { executable: "sh", args: [] } : 42;
      expect(() => validateRawReport(raw)).toThrow("RAW_REPORT_INVALID");
    },
  );

  it("rejects unknown raw report fields", () => {
    expect(() =>
      validateRawReport({
        schema_version: 1,
        command: { executable: "node", args: [] },
        started_at: "2026-08-08T00:00:00.000Z",
        finished_at: "2026-08-08T00:00:01.000Z",
        exit_code: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
        attacker_field: true,
      }),
    ).toThrow("RAW_REPORT_INVALID");
  });

  it("rejects path traversal and absolute evidence paths", () => {
    expect(() => safeRepositoryPath(sourceRoot, "../escape")).toThrow(
      "EVIDENCE_PATH_INVALID",
    );
    expect(() => safeRepositoryPath(sourceRoot, "/tmp/escape")).toThrow(
      "EVIDENCE_PATH_INVALID",
    );
  });
});

describe("current evidence and independent review binding", () => {
  it.each(["commit_sha", "contract_sha", "fixture_sha", "config_sha"])(
    "rejects stale evidence %s",
    async (field) => {
      const root = await prepareReviewedGate();
      const context = await computeCurrentContext(root, "d0");
      const path = resolve(
        root,
        evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
      );
      const evidence = await json(path);
      evidence[field] =
        field === "commit_sha" ? "a".repeat(40) : "a".repeat(64);
      await writeJson(path, evidence);
      await expect(
        runGate(root, "d0", { executeCapabilities: false }),
      ).rejects.toThrow("STALE_EVIDENCE");
    },
  );

  it.each(["commit_sha", "contract_sha", "fixture_sha", "config_sha"])(
    "rejects stale review %s before accepting its signature",
    async (field) => {
      const root = await prepareReviewedGate();
      const context = await computeCurrentContext(root, "d0");
      const path = resolve(root, reviewPath(context.commit_sha, "d0"));
      const review = await json(path);
      review[field] = field === "commit_sha" ? "b".repeat(40) : "b".repeat(64);
      await writeJson(path, review);
      await expect(
        runGate(root, "d0", { executeCapabilities: false }),
      ).rejects.toThrow("STALE_EVIDENCE");
    },
  );

  it("rejects swapping another CAP's raw report even when its hash is updated", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const target = resolve(
      root,
      evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    const source = resolve(
      root,
      evidencePath(context.commit_sha, "d0", "CAP-INST-001"),
    );
    const targetEvidence = await json(target);
    const sourceEvidence = await json(source);
    targetEvidence.raw_report = sourceEvidence.raw_report;
    await writeJson(target, targetEvidence);
    await expect(
      runGate(root, "d0", { executeCapabilities: false }),
    ).rejects.toThrow("EVIDENCE_PATH_INVALID");
  });

  it("rejects raw report bytes that do not match the recorded SHA-256", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(
      root,
      rawReportPath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    await writeFile(path, "tampered\n");
    await expect(
      runGate(root, "d0", { executeCapabilities: false }),
    ).rejects.toThrow("RAW_REPORT_HASH_MISMATCH");
  });

  it("rejects self review while recording", async () => {
    const root = await setupRepository();
    for (const capId of D0_REQUIRED_CAP_IDS)
      await runCapability(root, "d0", capId);
    const context = await computeCurrentContext(root, "d0");
    await writeChecklistForTesting(root, "d0", context.commit_sha, [
      "functional",
    ]);
    await expect(
      recordReview(root, "d0", context.commit_sha, {
        identityProvider: () => ({
          reviewer_id: "github:100",
          source: {
            provider: "github-actions",
            actor: "implementer",
            actor_id: "100",
          },
        }),
      }),
    ).rejects.toThrow("INDEPENDENT_REVIEW_REQUIRED");
  });
});

describe("trusted reviewer identity boundary", () => {
  it("accepts only the GitHub Actions actor ID as canonical identity", () => {
    expect(
      resolveTrustedReviewerIdentity({
        GITHUB_ACTIONS: "true",
        GITHUB_ACTOR: "quality-owner",
        GITHUB_ACTOR_ID: "12345",
      }),
    ).toEqual({
      reviewer_id: "github:12345",
      source: {
        provider: "github-actions",
        actor: "quality-owner",
        actor_id: "12345",
      },
    });
  });

  it("rejects custom reviewer env, local git identity, and incomplete GitHub identity", () => {
    expect(() =>
      resolveTrustedReviewerIdentity({
        HUOQIU_REVIEWER_ID: "github:999",
        GIT_AUTHOR_EMAIL: "employee@example.invalid",
      }),
    ).toThrow("TRUSTED_REVIEWER_IDENTITY_REQUIRED");
    expect(() =>
      resolveTrustedReviewerIdentity({
        GITHUB_ACTIONS: "true",
        GITHUB_ACTOR: "name",
      }),
    ).toThrow("TRUSTED_REVIEWER_IDENTITY_REQUIRED");
  });

  it("rejects a CLI reviewer override before touching repository state", async () => {
    await expect(
      recordReviewMain([
        "--milestone",
        "d0",
        "--commit-sha",
        "a".repeat(40),
        "--reviewer-id",
        "github:999",
      ]),
    ).rejects.toThrow("CLI_ARGUMENT_INVALID");
  });
});

describe("milestone results and explicit not-ready behavior", () => {
  it("executes D0 commands and prints the exact successful line", async () => {
    const root = await prepareReviewedGate("d0");
    await expect(runGate(root, "d0")).resolves.toBe(
      "D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0",
    );
  });

  it("prints the exact M1 successful line only after all ten capabilities", async () => {
    const root = await prepareReviewedGate("m1");
    await expect(
      runGate(root, "m1", { executeCapabilities: false }),
    ).resolves.toBe(
      "M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0",
    );
  });

  it("future gate placeholder is explicit non-zero behavior, never PASS", async () => {
    await expect(notImplementedMain(["--gate", "security"])).rejects.toThrow(
      "NOT_IMPLEMENTED",
    );
  });

  it("registers quality tests and script checks in the root regression commands", async () => {
    const packageJson = await json(resolve(sourceRoot, "package.json"));
    const scripts = packageJson.scripts as Record<string, string>;
    expect(scripts.test).toContain("scripts/quality/test");
    expect(scripts.lint).toContain("scripts/quality");
    expect(scripts.typecheck).toContain("scripts/quality/tsconfig.json");
    expect(scripts["qa:cap"]).toBe("tsx scripts/quality/run-capability.mts");
    expect(scripts["gate:d0"]).toBe(
      "tsx scripts/quality/run-gate.mts --milestone d0",
    );
    expect(scripts["gate:m1"]).toBe(
      "tsx scripts/quality/run-gate.mts --milestone m1",
    );
  });

  it("keeps the schema artifacts strict and documents cross-field independence", async () => {
    const evidenceSchema = await json(
      resolve(sourceRoot, "quality/evidence/evidence.schema.json"),
    );
    const reviewSchema = await json(
      resolve(sourceRoot, "quality/evidence/review.schema.json"),
    );
    expect(evidenceSchema.additionalProperties).toBe(false);
    expect(reviewSchema.additionalProperties).toBe(false);
    expect(reviewSchema["x-huoqiu-not-in"]).toEqual({
      valuePointer: "/reviewer_id",
      arrayPointer: "/implementer_ids",
      error: "INDEPENDENT_REVIEW_REQUIRED",
    });
  });

  it("loads the real manifests without letting them redefine the oracle", async () => {
    const root = await setupRepository();
    const { manifest } = await loadInputsForTesting(root, "d0");
    expect(manifest.required_caps.map((item) => item.cap_id)).toEqual(
      D0_REQUIRED_CAP_IDS,
    );
  });
});
