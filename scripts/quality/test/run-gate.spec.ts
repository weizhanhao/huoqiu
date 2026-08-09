import { execFile as execFileCallback } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { Session } from "node:inspector";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { checkNoSkips } from "../check-no-skips.mts";
import {
  D0_REQUIRED_CAP_IDS,
  M1_REQUIRED_CAP_IDS,
  assertRequiredScope,
  assembleEvidenceFromRawReport,
  checklistPath,
  computeCurrentContext,
  evidencePath,
  executeCommand,
  hashRepositoryInputs,
  loadInputsForTesting,
  parseCapabilitySummary,
  rawReportPath,
  recordAuthorship,
  recordReview,
  resolveTrustedReviewerIdentity,
  reviewPath,
  runCapability,
  runGate,
  safeRepositoryPath,
  scanForInvalidTestMarkers,
  validateCommand,
  validateEvidence,
  validateManifest,
  validateRawReport,
  validateReview,
  writeChecklistForTesting,
  writeEvidenceFileForTesting,
} from "../gate-core.mts";
import { parseStrictFlags } from "../cli.mts";
import { main as notImplementedMain } from "../not-implemented-gate.mts";
import { main as e2eGateMain } from "../e2e-gate.mts";
import { main as mobileD0Main } from "../mobile-d0-evidence.mts";
import { main as recordAuthorshipMain } from "../record-authorship.mts";
import { main as recordReviewMain } from "../record-review.mts";
import { main as buildMobileArtifactsMain } from "../../release/build-mobile-artifacts.mts";

const execFile = promisify(execFileCallback);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const gateCorePath = resolve(sourceRoot, "scripts/quality/gate-core.mts");
const temporaryRoots: string[] = [];
const reviewEnvironments = new Map<string, NodeJS.ProcessEnv>();
const authorshipEnvironments = new Map<string, NodeJS.ProcessEnv>();
const registrySigners = new Map<string, (unsigned: unknown) => string>();

const canonicalJsonForTesting = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map(canonicalJsonForTesting).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJsonForTesting(record[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const verifierBundleSha256ForTesting = (
  entrypointBytes: Uint8Array,
  loadedCoreBytes: Uint8Array,
): string => {
  const hash = createHash("sha256");
  hash.update("HUOQIU-VERIFIER-BUNDLE\0v1\0");
  for (const [label, bytes] of [
    ["ENTRYPOINT", entrypointBytes],
    ["LOADED_CORE", loadedCoreBytes],
  ] as const) {
    hash.update(label);
    hash.update("\0SIZE\0");
    hash.update(String(bytes.byteLength));
    hash.update("\0CONTENT\0");
    hash.update(bytes);
    hash.update("\0END\0");
  }
  return hash.digest("hex");
};

const inMemoryScriptBytesForTesting = async (path: string): Promise<Buffer> => {
  const expectedUrl = pathToFileURL(await realpath(path)).href;
  const session = new Session();
  session.connect();
  const scripts = new Map<string, string>();
  session.on("Debugger.scriptParsed", ({ params }) => {
    if (params.url.length > 0) scripts.set(params.url, params.scriptId);
  });
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      session.post("Debugger.enable", (error) =>
        error === null || error === undefined
          ? resolvePromise()
          : rejectPromise(error),
      );
    });
    const scriptId = scripts.get(expectedUrl);
    if (scriptId === undefined)
      throw new Error(`missing in-memory verifier script ${expectedUrl}`);
    const source = await new Promise<string>(
      (resolvePromise, rejectPromise) => {
        session.post(
          "Debugger.getScriptSource",
          { scriptId },
          (error, result) => {
            if (error !== null && error !== undefined) {
              rejectPromise(error);
              return;
            }
            const scriptSource = (
              result as { scriptSource?: unknown } | undefined
            )?.scriptSource;
            if (typeof scriptSource !== "string") {
              rejectPromise(new Error("inspector omitted script source"));
              return;
            }
            resolvePromise(scriptSource);
          },
        );
      },
    );
    return Buffer.from(source, "utf8");
  } finally {
    session.disconnect();
  }
};

const installEphemeralReviewTrust = async (root: string): Promise<void> => {
  const rootPair = generateKeyPairSync("ed25519");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const authorshipPair = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const keyId = `ed25519:${createHash("sha256").update(publicDer).digest("hex")}`;
  const workflowContents = await readFile(
    resolve(root, ".github/workflows/d0-quality-review.yml"),
  );
  const authorshipDer = authorshipPair.publicKey.export({
    format: "der",
    type: "spki",
  });
  const authorshipKeyId = `ed25519:${createHash("sha256")
    .update(authorshipDer)
    .digest("hex")}`;
  const authorshipWorkflowSha = "d".repeat(40);
  const rootDer = rootPair.publicKey.export({ format: "der", type: "spki" });
  const rootKeyId = `ed25519:${createHash("sha256").update(rootDer).digest("hex")}`;
  const verifierArgument = process.argv[1];
  if (verifierArgument === undefined)
    throw new Error("missing test verifier entrypoint");
  const verifierEntrypoint = resolve(verifierArgument);
  const verifierSha = verifierBundleSha256ForTesting(
    await inMemoryScriptBytesForTesting(verifierEntrypoint),
    await inMemoryScriptBytesForTesting(gateCorePath),
  );
  const launcherRoot = await mkdtemp(
    resolve(tmpdir(), "huoqiu-protected-launcher-"),
  );
  temporaryRoots.push(launcherRoot);
  const launcherPath = resolve(launcherRoot, "launcher.mjs");
  await writeFile(
    launcherPath,
    [
      "#!/usr/bin/env node",
      "import { spawn } from 'node:child_process';",
      "const marker = process.argv[1];",
      "const encoded = process.argv[2];",
      "if (marker !== '--huoqiu-request-v1' || encoded === undefined) process.exit(90);",
      "const request = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));",
      "const environment = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC', HUOQIU_PROCESS_TREE_TOKEN: process.env.HUOQIU_PROCESS_TREE_TOKEN };",
      "const run = (command) => new Promise((resolve, reject) => {",
      "  const child = spawn(command.executable, command.args, { cwd: request.workspace, env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });",
      "  let stdout = ''; let stderr = '';",
      "  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');",
      "  child.stdout.on('data', (chunk) => { stdout += chunk; });",
      "  child.stderr.on('data', (chunk) => { stderr += chunk; });",
      "  child.once('error', reject);",
      "  child.once('close', (code, signal) => resolve({ code: code ?? -1, signal, stdout, stderr }));",
      "});",
      "if (request.install === true) {",
      "  const install = await run({ executable: 'pnpm', args: ['install', '--offline', '--frozen-lockfile', '--strict-peer-dependencies'] });",
      "  if (install.code !== 0 || install.signal !== null) { process.stderr.write(install.stderr); process.exit(91); }",
      "}",
      "const startedAt = new Date().toISOString();",
      "const result = await run(request.command);",
      "const finishedAt = new Date().toISOString();",
      "const report = { schema_version: 1, command: request.command, started_at: startedAt, finished_at: finishedAt, exit_code: result.code, signal: result.signal, stdout: result.stdout, stderr: result.stderr };",
      "process.stdout.write(`HUOQIU_PROTECTED_EXECUTION_RESULT ${Buffer.from(JSON.stringify(report), 'utf8').toString('base64')}\\n`);",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(launcherPath, 0o700);
  const launcherSha = createHash("sha256")
    .update(await readFile(launcherPath))
    .digest("hex");
  const unsignedRegistry = {
    schema_version: 2,
    trust_domain: "huoqiu-quality",
    repository_id: "9001",
    epoch: 1,
    previous_registry_sha256: null,
    expires_at: "2099-01-01T00:00:00.000Z",
    verifier_sha256: verifierSha,
    execution_launcher_sha256: launcherSha,
    keys: {
      [keyId]: {
        subject_id: "github:200",
        roles: ["review"],
        actor: "quality-reviewer",
        actor_id: "200",
        repository: "huoqiu/huoqiu",
        repository_id: "9001",
        workflow_ref:
          "huoqiu/huoqiu/.github/workflows/d0-quality-review.yml@refs/heads/main",
        workflow_file_sha256: createHash("sha256")
          .update(workflowContents)
          .digest("hex"),
        ref: "refs/heads/main",
        event_name: "workflow_dispatch",
        protected_environment: "quality-review",
        public_key_spki_pem: publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      [authorshipKeyId]: {
        subject_id: "github:300",
        roles: ["authorship"],
        actor: "authorship-attestor",
        actor_id: "300",
        repository: "huoqiu/huoqiu",
        repository_id: "9001",
        workflow_ref:
          "huoqiu/huoqiu/.github/workflows/authorship.yml@refs/heads/main",
        workflow_file_sha256: createHash("sha256")
          .update(workflowContents)
          .digest("hex"),
        ref: "refs/heads/main",
        event_name: "workflow_dispatch",
        protected_environment: "authorship",
        public_key_spki_pem: authorshipPair.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
    },
  };
  await writeJson(resolve(root, "quality/reviewers/trust-registry.v2.json"), {
    ...unsignedRegistry,
    signature: {
      algorithm: "Ed25519",
      key_id: rootKeyId,
      value_base64: signBytes(
        null,
        Buffer.from(
          `HUOQIU-TRUST-REGISTRY\0v2\0${canonicalJsonForTesting(unsignedRegistry)}`,
          "utf8",
        ),
        rootPair.privateKey,
      ).toString("base64"),
    },
  });
  registrySigners.set(root, (unsigned) =>
    signBytes(
      null,
      Buffer.from(
        `HUOQIU-TRUST-REGISTRY\0v2\0${canonicalJsonForTesting(unsigned)}`,
        "utf8",
      ),
      rootPair.privateKey,
    ).toString("base64"),
  );
  const registryBytes = await readFile(
    resolve(root, "quality/reviewers/trust-registry.v2.json"),
  );
  const registrySha = createHash("sha256").update(registryBytes).digest("hex");
  reviewEnvironments.set(root, {
    GITHUB_ACTIONS: "true",
    GITHUB_ACTOR: "quality-reviewer",
    GITHUB_ACTOR_ID: "200",
    GITHUB_REPOSITORY: "huoqiu/huoqiu",
    GITHUB_REPOSITORY_ID: "9001",
    GITHUB_WORKFLOW_REF:
      "huoqiu/huoqiu/.github/workflows/d0-quality-review.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: "a".repeat(40),
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "7001",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_JOB: "independent-review",
    HUOQIU_REVIEW_ENVIRONMENT: "quality-review",
    HUOQIU_REVIEW_KEY_ID: keyId,
    HUOQIU_REVIEW_PRIVATE_KEY_B64: Buffer.from(
      privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      "utf8",
    ).toString("base64"),
    HUOQIU_VERIFIER_ROOT_PUBLIC_KEY_SPKI_B64:
      Buffer.from(rootDer).toString("base64"),
    HUOQIU_VERIFIER_ROOT_KEY_ID: rootKeyId,
    HUOQIU_VERIFIER_SHA256: verifierSha,
    HUOQIU_VERIFIER_ENTRYPOINT_PATH: verifierEntrypoint,
    HUOQIU_EXECUTION_LAUNCHER_PATH: launcherPath,
    HUOQIU_EXECUTION_LAUNCHER_SHA256: launcherSha,
    HUOQIU_EXECUTION_ISOLATION_PROFILE:
      "container-v1:no-network,read-only-source,owned-process-tree",
    HUOQIU_REPOSITORY_ID: "9001",
    HUOQIU_TRUST_REGISTRY_EPOCH: "1",
    HUOQIU_TRUST_REGISTRY_SHA256: registrySha,
  });
  authorshipEnvironments.set(root, {
    GITHUB_ACTIONS: "true",
    GITHUB_ACTOR: "authorship-attestor",
    GITHUB_ACTOR_ID: "300",
    GITHUB_REPOSITORY: "huoqiu/huoqiu",
    GITHUB_REPOSITORY_ID: "9001",
    GITHUB_WORKFLOW_REF:
      "huoqiu/huoqiu/.github/workflows/authorship.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: authorshipWorkflowSha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "7002",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_JOB: "derive-authorship",
    HUOQIU_REVIEW_ENVIRONMENT: "authorship",
    HUOQIU_AUTHORSHIP_KEY_ID: authorshipKeyId,
    HUOQIU_AUTHORSHIP_PRIVATE_KEY_B64: Buffer.from(
      authorshipPair.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      "utf8",
    ).toString("base64"),
    HUOQIU_AUTHORSHIP_INPUT_SHA256: "c".repeat(64),
    HUOQIU_AUTHORSHIP_POLICY_VERSION: "external-attestor-v1",
    HUOQIU_VERIFIER_ROOT_PUBLIC_KEY_SPKI_B64:
      Buffer.from(rootDer).toString("base64"),
    HUOQIU_VERIFIER_ROOT_KEY_ID: rootKeyId,
    HUOQIU_VERIFIER_SHA256: verifierSha,
    HUOQIU_VERIFIER_ENTRYPOINT_PATH: verifierEntrypoint,
    HUOQIU_EXECUTION_LAUNCHER_PATH: launcherPath,
    HUOQIU_EXECUTION_LAUNCHER_SHA256: launcherSha,
    HUOQIU_EXECUTION_ISOLATION_PROFILE:
      "container-v1:no-network,read-only-source,owned-process-tree",
    HUOQIU_REPOSITORY_ID: "9001",
    HUOQIU_TRUST_REGISTRY_EPOCH: "1",
    HUOQIU_TRUST_REGISTRY_SHA256: registrySha,
  });
};

const json = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const resignTrustRegistry = async (
  root: string,
  mutate: (unsigned: Record<string, unknown>) => void,
): Promise<void> => {
  const registryPath = resolve(
    root,
    "quality/reviewers/trust-registry.v2.json",
  );
  const registry = await json(registryPath);
  const unsigned = { ...registry };
  delete unsigned.signature;
  mutate(unsigned);
  const signer = registrySigners.get(root);
  const reviewEnvironment = reviewEnvironments.get(root);
  const authorshipEnvironment = authorshipEnvironments.get(root);
  const rootKeyId = reviewEnvironment?.HUOQIU_VERIFIER_ROOT_KEY_ID;
  if (
    signer === undefined ||
    reviewEnvironment === undefined ||
    authorshipEnvironment === undefined ||
    rootKeyId === undefined
  ) {
    throw new Error("missing trust-registry signing fixture");
  }
  await writeJson(registryPath, {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: rootKeyId,
      value_base64: signer(unsigned),
    },
  });
  const registrySha = createHash("sha256")
    .update(await readFile(registryPath))
    .digest("hex");
  reviewEnvironment.HUOQIU_TRUST_REGISTRY_SHA256 = registrySha;
  authorshipEnvironment.HUOQIU_TRUST_REGISTRY_SHA256 = registrySha;
};

const installAuthorshipArchive = (
  root: string,
  headSha: string,
  actorIds: string[],
): void => {
  const authorshipEnvironment = authorshipEnvironments.get(root);
  const reviewEnvironment = reviewEnvironments.get(root);
  if (authorshipEnvironment === undefined || reviewEnvironment === undefined)
    throw new Error("missing ephemeral authorship environment");
  const trustedBaseSha = authorshipEnvironment.HUOQIU_TRUSTED_BASE_SHA;
  if (trustedBaseSha === undefined)
    throw new Error("missing trusted base for authorship archive");
  const bytes = Buffer.from(
    `${JSON.stringify({
      schema_version: 1,
      provider: "external-attestor",
      repository_id: "9001",
      trusted_base_sha: trustedBaseSha,
      head_sha: headSha,
      contributors: actorIds.map((actorId) => ({
        provider: "github",
        actor_id: actorId,
      })),
    })}\n`,
    "utf8",
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  const encoded = bytes.toString("base64");
  authorshipEnvironment.HUOQIU_AUTHORSHIP_ARCHIVE_B64 = encoded;
  authorshipEnvironment.HUOQIU_AUTHORSHIP_INPUT_SHA256 = digest;
  reviewEnvironment.HUOQIU_AUTHORSHIP_ARCHIVE_B64 = encoded;
  reviewEnvironment.HUOQIU_AUTHORSHIP_INPUT_SHA256 = digest;
};

const rewriteSignedRegistry = async (
  root: string,
  mutate: (unsigned: Record<string, unknown>) => void,
): Promise<string> => {
  const path = resolve(root, "quality/reviewers/trust-registry.v2.json");
  const registry = await json(path);
  const signature = registry.signature as Record<string, unknown>;
  const unsigned = { ...registry };
  delete unsigned.signature;
  mutate(unsigned);
  const signer = registrySigners.get(root);
  if (signer === undefined) throw new Error("missing registry signer");
  await writeJson(path, {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: signature.key_id,
      value_base64: signer(unsigned),
    },
  });
  await execFile("git", ["add", "quality/reviewers/trust-registry.v2.json"], {
    cwd: root,
  });
  await execFile("git", ["commit", "-q", "-m", "rotate trust registry"], {
    cwd: root,
  });
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
};

const signedRegistryBytes = async (
  root: string,
  mutate: (unsigned: Record<string, unknown>) => void = () => undefined,
): Promise<Buffer> => {
  const path = resolve(root, "quality/reviewers/trust-registry.v2.json");
  const registry = await json(path);
  const signature = registry.signature as Record<string, unknown>;
  const unsigned = { ...registry };
  delete unsigned.signature;
  mutate(unsigned);
  const signer = registrySigners.get(root);
  if (signer === undefined) throw new Error("missing registry signer");
  return Buffer.from(
    `${JSON.stringify(
      {
        ...unsigned,
        signature: {
          algorithm: "Ed25519",
          key_id: signature.key_id,
          value_base64: signer(unsigned),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

const registryHistoryEnvironment = (registries: readonly Buffer[]): string =>
  Buffer.from(
    JSON.stringify(registries.map((registry) => registry.toString("base64"))),
    "utf8",
  ).toString("base64");

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
  return {
    executable: process.execPath,
    args: ["scripts/quality/test-capability.mjs", fixtureVersion],
  };
};

const capabilityProgram = (summary: Record<string, unknown>): string =>
  `console.log(${JSON.stringify(`HUOQIU_CAPABILITY_RESULT ${JSON.stringify(summary)}`)});\n`;

const writeCapabilityProgram = async (
  root: string,
  name: string,
  source: string,
): Promise<{ executable: string; args: string[] }> => {
  const relativePath = `scripts/quality/${name}.mjs`;
  const absolutePath = resolve(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, "utf8");
  return { executable: process.execPath, args: [relativePath] };
};

const setupRepository = async (
  milestone: "d0" | "m1" = "d0",
): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), `huoqiu-quality-${milestone}-`));
  temporaryRoots.push(root);
  for (const path of [
    ".gitignore",
    ".github/workflows/d0-quality-review.yml",
    "quality/gate-config.v1.json",
    "quality/evidence/authorship-input.schema.json",
    "quality/evidence/authorship.schema.json",
    "quality/evidence/evidence.schema.json",
    "quality/evidence/review.schema.json",
    "quality/reviewers/trust-registry.schema.json",
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
  await mkdir(resolve(root, "scripts/quality"), { recursive: true });
  await writeFile(
    resolve(root, "scripts/quality/test-capability.mjs"),
    [
      "const fixtureVersion = process.argv[2];",
      "const summary = { fixture_version: fixtureVersion, passed: 7, failed: 0, skipped: 0, invalid_test_markers: [], p0: 0, p1: 0 };",
      "console.log(`HUOQIU_CAPABILITY_RESULT ${JSON.stringify(summary)}`);",
      "",
    ].join("\n"),
    "utf8",
  );
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
  await installEphemeralReviewTrust(root);
  await execFile("git", ["init", "-q"], { cwd: root });
  await execFile("git", ["config", "user.name", "Quality Test"], { cwd: root });
  await execFile("git", ["config", "user.email", "quality@example.invalid"], {
    cwd: root,
  });
  await execFile("git", ["add", "."], { cwd: root });
  await execFile("git", ["commit", "-q", "-m", "quality fixture"], {
    cwd: root,
  });
  const head = (
    await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  const authorshipEnvironment = authorshipEnvironments.get(root);
  const reviewEnvironment = reviewEnvironments.get(root);
  if (authorshipEnvironment === undefined || reviewEnvironment === undefined)
    throw new Error("missing ephemeral signing environment");
  authorshipEnvironment.HUOQIU_TRUSTED_BASE_SHA = head;
  reviewEnvironment.HUOQIU_TRUSTED_BASE_SHA = head;
  reviewEnvironment.GITHUB_WORKFLOW_SHA = head;
  reviewEnvironment.HUOQIU_AUTHORSHIP_POLICY_VERSION =
    authorshipEnvironment.HUOQIU_AUTHORSHIP_POLICY_VERSION;
  installAuthorshipArchive(root, head, ["100"]);
  await recordAuthorship(root, head, {
    milestone,
    environment: authorshipEnvironment,
  });
  return root;
};

const refreshAuthorship = async (
  root: string,
  milestone: "d0" | "m1",
  implementerIds: string[],
): Promise<void> => {
  const head = (
    await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  const environment = authorshipEnvironments.get(root);
  if (environment === undefined)
    throw new Error("missing ephemeral authorship environment");
  installAuthorshipArchive(
    root,
    head,
    implementerIds.map((identity) => identity.replace(/^github:/u, "")),
  );
  await recordAuthorship(root, head, {
    milestone,
    environment,
  });
};

const signingOptions = (
  root: string,
  environmentOverrides: NodeJS.ProcessEnv = {},
  clock?: () => Date,
  dimension?: string,
) =>
  ({
    // Kept only so the pre-hardening implementation reaches the RED assertions.
    // The production API intentionally removes this injectable identity boundary.
    identityProvider: () => ({
      reviewer_id: "github:200",
      source: {
        provider: "github-actions" as const,
        actor: "quality-reviewer",
        actor_id: "200",
      },
    }),
    environment: {
      ...reviewEnvironments.get(root),
      ...environmentOverrides,
    },
    ...(clock === undefined ? {} : { clock }),
    ...(dimension === undefined ? {} : { dimension }),
  }) as never;

const runTrustedGate = async (
  root: string,
  milestone: "d0" | "m1",
): Promise<string> =>
  await runGate(root, milestone, {
    environment: reviewEnvironments.get(root) ?? {},
  });

const runTrustedCapability = async (
  root: string,
  milestone: "d0" | "m1",
  capId: string,
) =>
  await runCapability(root, milestone, capId, {
    environment: reviewEnvironments.get(root) ?? {},
  });

const prepareReviewInputs = async (
  root: string,
  milestone: "d0" | "m1",
): Promise<Awaited<ReturnType<typeof computeCurrentContext>>> => {
  const capIds = milestone === "d0" ? D0_REQUIRED_CAP_IDS : M1_REQUIRED_CAP_IDS;
  for (const capId of capIds)
    await runTrustedCapability(root, milestone, capId);
  const context = await computeCurrentContext(root, milestone);
  await writeChecklistForTesting(
    root,
    milestone,
    context.commit_sha,
    milestone === "d0"
      ? ["functional", "quality"]
      : ["functional", "quality", "security", "release"],
    milestone === "m1" ? "release" : undefined,
  );
  return context;
};

const prepareReviewedGate = async (
  milestone: "d0" | "m1" = "d0",
): Promise<string> => {
  const root = await setupRepository(milestone);
  const context = await prepareReviewInputs(root, milestone);
  await recordReview(
    root,
    milestone,
    context.commit_sha,
    signingOptions(
      root,
      {},
      undefined,
      milestone === "m1" ? "release" : undefined,
    ),
  );
  return root;
};

afterEach(async () => {
  reviewEnvironments.clear();
  authorshipEnvironments.clear();
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
    await expect(runTrustedGate(root, "d0")).rejects.toThrow(
      "ORACLE_INTEGRITY_FAILURE",
    );
  });

  it("rejects candidate changes to the protected pending-capability inventory", async () => {
    const root = await setupRepository();
    const oraclePath = resolve(root, "quality/oracles/d0-required.json");
    const oracle = await json(oraclePath);
    oracle.pending_cap_ids = ["CAP-ID-001"];
    await writeJson(oraclePath, oracle);
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("ORACLE_INTEGRITY_FAILURE");
  });

  it("rejects non-canonical implementer aliases for implemented capabilities", () => {
    expect(() =>
      validateManifest(
        {
          schema_version: 1,
          milestone: "d0",
          fixture_version: "d0.v1",
          required_caps: D0_REQUIRED_CAP_IDS.map((capId) => ({
            cap_id: capId,
            command: successCommand("d0.v1"),
            implementer_ids: ["alice"],
          })),
          stretch_cap_ids: [],
        },
        "d0",
      ),
    ).toThrow("MANIFEST_SCHEMA_INVALID");
  });

  it("allows the pending sentinel only with the exact fail-closed command", () => {
    const manifest = {
      schema_version: 1,
      milestone: "d0",
      fixture_version: "d0.v1",
      required_caps: D0_REQUIRED_CAP_IDS.map((capId) => ({
        cap_id: capId,
        command: successCommand("d0.v1"),
        implementer_ids: ["pending:capability-implementation"],
      })),
      stretch_cap_ids: [],
    };
    expect(() => validateManifest(manifest, "d0")).toThrow(
      "MANIFEST_SCHEMA_INVALID",
    );
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

  it.each([
    ["xit", "xit('disabled', () => {})"],
    ["xdescribe", "xdescribe('disabled suite', () => {})"],
    ["skipIf", "test.skipIf(process.env.CI)('conditional', () => {})"],
    ["runner output", "Tests  2 skipped (2)"],
    ["JUnit skipped", '<testcase name="later"><skipped/></testcase>'],
    ["TAP skip", "ok 1 - later # SKIP unavailable"],
    ["Node test skip", "# SKIP platform unavailable"],
    ["Go skip", "--- SKIP: TestIntegration (0.00s)"],
  ])("detects %s as forbidden skipped coverage", (_name, report) => {
    expect(scanForInvalidTestMarkers(report)).toContain("skip");
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
    firstCap.command = await writeCapabilityProgram(
      root,
      "skipped-capability",
      capabilityProgram(skippedSummary),
    );
    await writeJson(manifestPath, manifest);
    await execFile(
      "git",
      [
        "add",
        "quality/manifests/d0-required.json",
        "scripts/quality/skipped-capability.mjs",
      ],
      { cwd: root },
    );
    await execFile("git", ["commit", "-q", "-m", "exercise skipped result"], {
      cwd: root,
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("REQUIRED_TEST_INVALID");
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

  it.each(["--assume-unchanged", "--skip-worktree"])(
    "rejects tracked files hidden by %s",
    async (flag) => {
      const root = await setupRepository();
      await execFile(
        "git",
        ["update-index", flag, "packages/contracts/src/d0/contract.ts"],
        { cwd: root },
      );
      await expect(computeCurrentContext(root, "d0")).rejects.toThrow(
        "INDEX_FLAG_FORBIDDEN",
      );
    },
  );

  it("uses raw Git objects and never executes candidate Git filters", async () => {
    const root = await setupRepository();
    const originalGitDir = process.env.GIT_DIR;
    const originalGitWorkTree = process.env.GIT_WORK_TREE;
    process.env.GIT_DIR = resolve(root, "attacker-controlled-git-dir");
    process.env.GIT_WORK_TREE = resolve(root, "attacker-controlled-worktree");
    try {
      await expect(computeCurrentContext(root, "d0")).resolves.toMatchObject({
        commit_sha: expect.stringMatching(/^[a-f0-9]{40}$/u),
      });
    } finally {
      if (originalGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = originalGitDir;
      if (originalGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = originalGitWorkTree;
    }

    const rawContext = await computeCurrentContext(root, "d0");
    const replacement = (
      await execFile(
        "git",
        [
          "commit-tree",
          "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
          "-m",
          "attacker replacement commit",
        ],
        { cwd: root },
      )
    ).stdout.trim();
    await execFile("git", ["replace", rawContext.commit_sha, replacement], {
      cwd: root,
    });
    await expect(computeCurrentContext(root, "d0")).resolves.toEqual(
      rawContext,
    );

    const installAttributes = async (
      repository: string,
      attributes: string,
    ): Promise<void> => {
      await writeFile(resolve(repository, ".gitattributes"), attributes);
      await execFile("git", ["add", ".gitattributes"], { cwd: repository });
      await execFile("git", ["commit", "-q", "-m", "candidate attributes"], {
        cwd: repository,
      });
    };

    const cleanRoot = await setupRepository();
    await installAttributes(
      cleanRoot,
      "packages/contracts/src/d0/contract.ts filter=attack\n",
    );
    const cleanMarker = resolve(cleanRoot, ".git/clean-filter-executed");
    const cleanFilter = resolve(cleanRoot, ".git/clean-filter.cjs");
    await writeFile(
      cleanFilter,
      [
        "const { writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(cleanMarker)}, 'executed');`,
        "process.stdin.pipe(process.stdout);",
        "",
      ].join("\n"),
    );
    await execFile(
      "git",
      ["config", "filter.attack.clean", `${process.execPath} ${cleanFilter}`],
      { cwd: cleanRoot },
    );
    await expect(computeCurrentContext(cleanRoot, "d0")).resolves.toMatchObject(
      {
        commit_sha: expect.stringMatching(/^[a-f0-9]{40}$/u),
      },
    );
    await expect(readFile(cleanMarker)).rejects.toThrow();

    const processRoot = await setupRepository();
    await installAttributes(
      processRoot,
      "packages/contracts/src/d0/contract.ts filter=attack\n",
    );
    const processMarker = resolve(processRoot, ".git/process-filter-executed");
    const processFilter = resolve(processRoot, ".git/process-filter.cjs");
    await writeFile(
      processFilter,
      [
        "const { writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(processMarker)}, 'executed');`,
        "process.exit(1);",
        "",
      ].join("\n"),
    );
    await execFile(
      "git",
      [
        "config",
        "filter.attack.process",
        `${process.execPath} ${processFilter}`,
      ],
      { cwd: processRoot },
    );
    await expect(
      computeCurrentContext(processRoot, "d0"),
    ).resolves.toMatchObject({
      commit_sha: expect.stringMatching(/^[a-f0-9]{40}$/u),
    });
    await expect(readFile(processMarker)).rejects.toThrow();

    const textconvRoot = await setupRepository();
    await installAttributes(
      textconvRoot,
      "packages/contracts/src/d0/contract.ts diff=attack\n",
    );
    await writeFile(
      resolve(textconvRoot, "packages/contracts/src/d0/contract.ts"),
      '{"contract":"d0","revision":2}\n',
    );
    await execFile("git", ["add", "packages/contracts/src/d0/contract.ts"], {
      cwd: textconvRoot,
    });
    await execFile("git", ["commit", "-q", "-m", "candidate revision"], {
      cwd: textconvRoot,
    });
    const textconvMarker = resolve(textconvRoot, ".git/textconv-executed");
    const textconv = resolve(textconvRoot, ".git/textconv.cjs");
    await writeFile(
      textconv,
      [
        "const { readFileSync, writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(textconvMarker)}, 'executed');`,
        "process.stdout.write(readFileSync(process.argv[2]));",
        "",
      ].join("\n"),
    );
    await execFile(
      "git",
      ["config", "diff.attack.textconv", `${process.execPath} ${textconv}`],
      { cwd: textconvRoot },
    );
    await refreshAuthorship(textconvRoot, "d0", ["github:100"]);
    await expect(readFile(textconvMarker)).rejects.toThrow();
  });

  it("rejects an input whose parent directory is a symlink outside the repository", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-parent-link-root-"));
    const outside = await mkdtemp(
      resolve(tmpdir(), "huoqiu-parent-link-outside-"),
    );
    temporaryRoots.push(root, outside);
    await mkdir(resolve(root, "packages/contracts"), { recursive: true });
    await mkdir(resolve(outside, "d0"), { recursive: true });
    await writeFile(resolve(outside, "d0/contract.ts"), "export {};\n");
    await symlink(outside, resolve(root, "packages/contracts/src"), "dir");
    await expect(
      hashRepositoryInputs(root, "contract:d0", [
        { kind: "directory", path: "packages/contracts/src/d0" },
      ]),
    ).rejects.toThrow("GATE_INPUT_INVALID");
  });
});

describe("argv-only capability execution", () => {
  it.each([
    ["/bin/sh", ["dash", "ksh"]],
    ["/usr/bin/bash", ["csh", "tcsh"]],
    ["C:\\Windows\\System32\\cmd.exe", ["npm", "npx"]],
    ["powershell.exe", ["yarn", "bun"]],
  ])(
    "rejects shell executable path %s by normalized basename",
    (executable, additionalExecutables) => {
      for (const candidate of [executable, ...additionalExecutables]) {
        expect(() =>
          validateCommand({ executable: candidate, args: [] }),
        ).toThrow("COMMAND_INVALID");
      }
    },
  );

  it("rejects an env wrapper that indirectly launches a shell", () => {
    expect(() =>
      validateCommand({
        executable: "/usr/bin/env",
        args: ["sh", "-c", "printf attacker"],
      }),
    ).toThrow("COMMAND_INVALID");
    expect(() =>
      validateCommand({
        executable: "pnpm",
        args: ["exec", "playwright", "codegen"],
      }),
    ).toThrow("COMMAND_INVALID");
  });

  it.each([
    { executable: "pnpm", args: ["exec", "sh", "-c", "printf attacker"] },
    {
      executable: "/opt/pnpm/bin/pnpm",
      args: ["exec", "--", "bash", "-c", "printf attacker"],
    },
    { executable: process.execPath, args: ["-e", "console.log('attack')"] },
    {
      executable: "pnpm",
      args: ["exec", "tsx", "--eval", "console.log('attack')"],
    },
    { executable: process.execPath, args: ["--print", "process.pid"] },
    {
      executable: "pnpm",
      args: ["exec", "vitest", "--watch"],
    },
  ])("rejects eval and shell-wrapper command $executable $args", (command) => {
    expect(() => validateCommand(command)).toThrow("COMMAND_INVALID");
  });

  it("passes metacharacters as a literal argv value and never invokes a shell", async () => {
    expect(
      validateCommand({
        executable: "pnpm",
        args: ["exec", "vitest", "run", "quality.spec.ts"],
      }),
    ).toEqual({
      executable: "pnpm",
      args: ["exec", "vitest", "run", "quality.spec.ts"],
    });
    expect(
      validateCommand({
        executable: "pnpm",
        args: ["exec", "playwright", "test", "quality.spec.ts"],
      }),
    ).toEqual({
      executable: "pnpm",
      args: ["exec", "playwright", "test", "quality.spec.ts"],
    });
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-argv-"));
    temporaryRoots.push(root);
    const marker = resolve(root, "injected");
    const injected = `;require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`;
    const program = resolve(root, "print-argument.mjs");
    await writeFile(program, "console.log(process.argv[2]);\n", "utf8");
    const result = await executeCommand(root, {
      executable: process.execPath,
      args: [program, injected],
    });
    expect(result.stdout.trim()).toBe(injected);
    await expect(readFile(marker)).rejects.toThrow();
  });

  it("does not inherit caller secrets into executed commands", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-env-"));
    temporaryRoots.push(root);
    const program = resolve(root, "print-secret.mjs");
    await writeFile(
      program,
      "console.log(process.env.HUOQIU_SECRET_SENTINEL);\n",
      "utf8",
    );
    const result = await executeCommand(
      root,
      {
        executable: process.execPath,
        args: [program],
      },
      {
        environment: {
          ...process.env,
          HUOQIU_SECRET_SENTINEL: "must-not-leak",
          GIT_DIR: "/tmp/hostile-git-dir",
        },
      },
    );
    expect(result.stdout.trim()).toBe("undefined");
  });

  it("kills descendants after a normally exiting command", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-orphan-"));
    temporaryRoots.push(root);
    const marker = resolve(root, "orphan-wrote-after-parent-exit");
    const childPath = resolve(root, "orphan-child.cjs");
    const parentPath = resolve(root, "orphan-parent.cjs");
    await writeFile(
      childPath,
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 350);\n`,
      "utf8",
    );
    await writeFile(
      parentPath,
      [
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, [${JSON.stringify(childPath)}], { stdio: 'ignore' }).unref();`,
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await executeCommand(root, {
      executable: process.execPath,
      args: [parentPath],
    });
    expect(result.exit_code).toBe(0);
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 600),
    );
    await expect(readFile(marker)).rejects.toThrow();
  });

  it("kills a detached double-fork that escapes the original process group", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-double-fork-"));
    temporaryRoots.push(root);
    const marker = resolve(root, "detached-double-fork-marker");
    const grandchildPath = resolve(root, "grandchild.cjs");
    const middlePath = resolve(root, "middle.cjs");
    const parentPath = resolve(root, "parent.cjs");
    await writeFile(
      grandchildPath,
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 500);\n`,
      "utf8",
    );
    await writeFile(
      middlePath,
      [
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, [${JSON.stringify(grandchildPath)}], { detached: true, stdio: 'ignore' }).unref();`,
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      parentPath,
      [
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, [${JSON.stringify(middlePath)}], { detached: true, stdio: 'ignore' }).unref();`,
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await executeCommand(root, {
      executable: process.execPath,
      args: [parentPath],
    });
    expect(result.exit_code).toBe(0);
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 800),
    );
    await expect(readFile(marker)).rejects.toThrow();
  });

  it("kills a detached double-fork even after the command deletes its ownership token", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-tokenless-fork-"));
    temporaryRoots.push(root);
    const marker = resolve(root, "tokenless-double-fork-marker");
    const grandchildPath = resolve(root, "tokenless-grandchild.cjs");
    const middlePath = resolve(root, "tokenless-middle.cjs");
    const parentPath = resolve(root, "tokenless-parent.cjs");
    await writeFile(
      grandchildPath,
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 500);\n`,
      "utf8",
    );
    await writeFile(
      middlePath,
      [
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, [${JSON.stringify(grandchildPath)}], { detached: true, stdio: 'ignore' }).unref();`,
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      parentPath,
      [
        "const { spawn } = require('node:child_process');",
        "delete process.env.HUOQIU_PROCESS_TREE_TOKEN;",
        `spawn(process.execPath, [${JSON.stringify(middlePath)}], { detached: true, stdio: 'ignore' }).unref();`,
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await executeCommand(root, {
      executable: process.execPath,
      args: [parentPath],
    });
    expect(result.exit_code).toBe(0);
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 800),
    );
    await expect(readFile(marker)).rejects.toThrow();
  });

  it("terminates a hung process at the configured timeout", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-timeout-"));
    temporaryRoots.push(root);
    const program = resolve(root, "hang.mjs");
    await writeFile(program, "setInterval(() => {}, 1000);\n", "utf8");
    await expect(
      executeCommand(
        root,
        {
          executable: process.execPath,
          args: [program],
        },
        { timeoutMs: 80 },
      ),
    ).rejects.toThrow("COMMAND_TIMEOUT");
  });

  it("kills a command that exceeds the combined stdout/stderr limit", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-output-"));
    temporaryRoots.push(root);
    const program = resolve(root, "large-output.mjs");
    await writeFile(program, "console.log('x'.repeat(10000));\n", "utf8");
    await expect(
      executeCommand(
        root,
        {
          executable: process.execPath,
          args: [program],
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

  it("validates canonical implementers and exact raw path without relying on callers", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const evidence = await json(
      resolve(root, evidencePath(context.commit_sha, "d0", "CAP-ID-001")),
    );
    expect(() =>
      validateEvidence({ ...evidence, implementer_ids: ["alice"] }),
    ).toThrow("EVIDENCE_SCHEMA_INVALID");
    expect(() =>
      validateEvidence({
        ...evidence,
        raw_report: {
          ...(evidence.raw_report as Record<string, unknown>),
          path: rawReportPath(context.commit_sha, "d0", "CAP-INST-001"),
        },
      }),
    ).toThrow("EVIDENCE_SCHEMA_INVALID");
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

  it("keeps every signed provenance field as strict as the review schema", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const review = await json(
      resolve(root, reviewPath(context.commit_sha, "d0")),
    );
    for (const [field, invalidValue] of [
      ["actor", "bad actor"],
      ["actor_id", "0"],
      ["repository", "missing-owner"],
      ["repository_id", "zero"],
      ["workflow_ref", "workflow.yml"],
      ["workflow_sha", "not-a-sha"],
      ["ref", "main"],
      ["event_name", "bad event"],
      ["run_id", "0"],
      ["run_attempt", "0"],
      ["job", "bad job"],
      ["protected_environment", "bad environment"],
    ] as const) {
      const candidate = structuredClone(review);
      (candidate.reviewer_source as Record<string, unknown>)[field] =
        invalidValue;
      expect(() => validateReview(candidate), field).toThrow(
        "REVIEW_SCHEMA_INVALID",
      );
    }
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

  it("rejects a zero exit raw report terminated by a signal", () => {
    expect(() =>
      validateRawReport({
        schema_version: 1,
        command: { executable: "node", args: [] },
        started_at: "2026-08-08T00:00:00.000Z",
        finished_at: "2026-08-08T00:00:01.000Z",
        exit_code: 0,
        signal: "SIGKILL",
        stdout: "ok",
        stderr: "",
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

describe("strict CLI normalization", () => {
  it("strips exactly one leading pnpm separator", () => {
    expect(
      parseStrictFlags(["--", "--milestone", "d0"], new Set(["--milestone"])),
    ).toEqual(new Map([["--milestone", ["d0"]]]));
    expect(() =>
      parseStrictFlags(
        ["--", "--", "--milestone", "d0"],
        new Set(["--milestone"]),
      ),
    ).toThrow("CLI_ARGUMENT_INVALID");
  });

  it("normalizes the one separator pnpm can preserve between flag pairs", () => {
    expect(
      parseStrictFlags(
        ["--milestone", "d0", "--", "--cap", "CAP-ID-001"],
        new Set(["--milestone", "--cap"]),
      ),
    ).toEqual(
      new Map([
        ["--milestone", ["d0"]],
        ["--cap", ["CAP-ID-001"]],
      ]),
    );
  });
});

describe("current evidence and independent review binding", () => {
  it.skipIf(process.platform === "win32")(
    "verifies protected trust before any PATH-resolved Git can execute",
    async () => {
      const root = await setupRepository();
      const hostileBin = await mkdtemp(
        resolve(tmpdir(), "huoqiu-hostile-git-"),
      );
      temporaryRoots.push(hostileBin);
      const marker = resolve(hostileBin, "fake-git-executed");
      const fakeGit = resolve(hostileBin, "git");
      await writeFile(
        fakeGit,
        [
          "#!/bin/sh",
          `printf escaped > ${JSON.stringify(marker)}`,
          'exec /usr/bin/git "$@"',
          "",
        ].join("\n"),
        "utf8",
      );
      await chmod(fakeGit, 0o700);
      const environment = reviewEnvironments.get(root);
      const launcherPath = environment?.HUOQIU_EXECUTION_LAUNCHER_PATH;
      if (launcherPath === undefined)
        throw new Error("missing protected launcher path");
      await writeFile(
        launcherPath,
        `${await readFile(launcherPath, "utf8")}\n// tampered\n`,
        "utf8",
      );
      const originalPath = process.env.PATH;
      process.env.PATH = `${hostileBin}:${originalPath ?? ""}`;
      try {
        await expect(
          runTrustedCapability(root, "d0", "CAP-ID-001"),
        ).rejects.toThrow("PROTECTED_EXECUTION_LAUNCHER_REQUIRED");
        await expect(readFile(marker)).rejects.toThrow();
      } finally {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
      }
    },
  );

  it("fails closed without a pinned protected launcher before network or external writes", async () => {
    const root = await setupRepository();
    const marker = resolve(root, "artifacts/external-write");
    let networkRequests = 0;
    const server = createServer((_request, response) => {
      networkRequests += 1;
      response.end("reachable");
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("missing local test server address");
      const manifestPath = resolve(root, "quality/manifests/d0-required.json");
      const manifest = await json(manifestPath);
      const first = (manifest.required_caps as Record<string, unknown>[])[0];
      if (first === undefined) throw new Error("missing test capability");
      const summary = `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
        fixture_version: "d0.v1",
        passed: 1,
        failed: 0,
        skipped: 0,
        invalid_test_markers: [],
        p0: 0,
        p1: 0,
      })}`;
      first.command = await writeCapabilityProgram(
        root,
        "network-escape",
        [
          `fetch('http://127.0.0.1:${address.port}')`,
          `.then(() => import('node:fs'))`,
          `.then(({ writeFileSync }) => writeFileSync(${JSON.stringify(marker)}, 'escaped'))`,
          `.then(() => console.log(${JSON.stringify(summary)}));`,
          "",
        ].join(""),
      );
      await writeJson(manifestPath, manifest);
      await execFile("git", ["add", "quality/manifests/d0-required.json"], {
        cwd: root,
      });
      await execFile("git", ["commit", "-q", "-m", "sandbox escape attack"], {
        cwd: root,
      });
      await expect(runCapability(root, "d0", "CAP-ID-001")).rejects.toThrow(
        "PROTECTED_EXECUTION_LAUNCHER_REQUIRED",
      );
      expect(networkRequests).toBe(0);
      await expect(readFile(marker)).rejects.toThrow();
    } finally {
      await new Promise<void>((resolvePromise, rejectPromise) =>
        server.close((error) =>
          error === undefined ? resolvePromise() : rejectPromise(error),
        ),
      );
    }
  });

  it("measures the actual protected launcher bytes before candidate execution", async () => {
    const root = await setupRepository();
    const environment = reviewEnvironments.get(root);
    const launcherPath = environment?.HUOQIU_EXECUTION_LAUNCHER_PATH;
    if (launcherPath === undefined)
      throw new Error("missing protected launcher path");
    await writeFile(
      launcherPath,
      `${await readFile(launcherPath, "utf8")}\n// tampered\n`,
      "utf8",
    );
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("PROTECTED_EXECUTION_LAUNCHER_REQUIRED");
  });

  it("binds verifier pins to both exact scripts already executing in memory", async () => {
    const root = await setupRepository();
    const environment = reviewEnvironments.get(root);
    const entrypoint = environment?.HUOQIU_VERIFIER_ENTRYPOINT_PATH;
    if (environment === undefined || entrypoint === undefined)
      throw new Error("missing protected verifier environment");
    const entrypointOnlySha = createHash("sha256")
      .update(await readFile(entrypoint))
      .digest("hex");
    await resignTrustRegistry(root, (unsigned) => {
      unsigned.verifier_sha256 = entrypointOnlySha;
    });
    environment.HUOQIU_VERIFIER_SHA256 = entrypointOnlySha;
    const authorshipEnvironment = authorshipEnvironments.get(root);
    if (authorshipEnvironment === undefined)
      throw new Error("missing protected authorship environment");
    authorshipEnvironment.HUOQIU_VERIFIER_SHA256 = entrypointOnlySha;
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");

    const substitutionRoot = await setupRepository();
    const substitutionEnvironment = reviewEnvironments.get(substitutionRoot);
    const substitutionAuthorship = authorshipEnvironments.get(substitutionRoot);
    const substitutionEntrypoint =
      substitutionEnvironment?.HUOQIU_VERIFIER_ENTRYPOINT_PATH;
    if (
      substitutionEnvironment === undefined ||
      substitutionAuthorship === undefined ||
      substitutionEntrypoint === undefined
    ) {
      throw new Error("missing substitution verifier environment");
    }
    const originalCoreBytes = await readFile(gateCorePath);
    const substitutedCoreBytes = Buffer.concat([
      originalCoreBytes,
      Buffer.from("\n// disk bytes replaced after this module was loaded\n"),
    ]);
    try {
      await writeFile(gateCorePath, substitutedCoreBytes);
      const substitutedDiskSha = verifierBundleSha256ForTesting(
        await readFile(substitutionEntrypoint),
        substitutedCoreBytes,
      );
      await resignTrustRegistry(substitutionRoot, (unsigned) => {
        unsigned.verifier_sha256 = substitutedDiskSha;
      });
      substitutionEnvironment.HUOQIU_VERIFIER_SHA256 = substitutedDiskSha;
      substitutionAuthorship.HUOQIU_VERIFIER_SHA256 = substitutedDiskSha;
      await expect(
        runTrustedCapability(substitutionRoot, "d0", "CAP-ID-001"),
      ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
    } finally {
      await writeFile(gateCorePath, originalCoreBytes);
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects a protected launcher writable by another principal",
    async () => {
      const root = await setupRepository();
      const environment = reviewEnvironments.get(root);
      const launcherPath = environment?.HUOQIU_EXECUTION_LAUNCHER_PATH;
      if (launcherPath === undefined)
        throw new Error("missing protected launcher path");
      await chmod(launcherPath, 0o722);
      await expect(
        runTrustedCapability(root, "d0", "CAP-ID-001"),
      ).rejects.toThrow("PROTECTED_EXECUTION_LAUNCHER_REQUIRED");
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a protected launcher whose parent is writable by another principal",
    async () => {
      const root = await setupRepository();
      const environment = reviewEnvironments.get(root);
      const launcherPath = environment?.HUOQIU_EXECUTION_LAUNCHER_PATH;
      if (launcherPath === undefined)
        throw new Error("missing protected launcher path");
      await chmod(dirname(launcherPath), 0o733);
      await expect(
        runTrustedCapability(root, "d0", "CAP-ID-001"),
      ).rejects.toThrow("PROTECTED_EXECUTION_LAUNCHER_REQUIRED");
    },
  );

  it.skipIf(process.platform === "win32")(
    "executes the verified launcher bytes even if its path is replaced and restored",
    async () => {
      const root = await setupRepository();
      await writeFile(
        resolve(root, "snapshot-padding.bin"),
        Buffer.alloc(8 * 1024 * 1024, 0x5a),
      );
      await execFile("git", ["add", "snapshot-padding.bin"], { cwd: root });
      await execFile("git", ["commit", "-q", "-m", "snapshot padding"], {
        cwd: root,
      });
      const environment = reviewEnvironments.get(root);
      const launcherPath = environment?.HUOQIU_EXECUTION_LAUNCHER_PATH;
      if (launcherPath === undefined)
        throw new Error("missing protected launcher path");
      const launcherDirectory = dirname(launcherPath);
      const originalBytes = await readFile(launcherPath, "utf8");
      const marker = resolve(root, "replacement-launcher-executed");
      const maliciousPath = resolve(
        launcherDirectory,
        "malicious-launcher.mjs",
      );
      const originalPath = resolve(launcherDirectory, "original-launcher.mjs");
      const maliciousBytes = originalBytes.replace(
        "import { spawn } from 'node:child_process';",
        [
          "import { spawn } from 'node:child_process';",
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(marker)}, 'escaped');`,
        ].join("\n"),
      );
      await writeFile(maliciousPath, maliciousBytes, "utf8");
      await chmod(maliciousPath, 0o700);
      const snapshotDirectories = new Set(
        (await readdir(tmpdir())).filter((name) =>
          name.startsWith("huoqiu-snapshot-"),
        ),
      );
      const resultPromise = runTrustedCapability(root, "d0", "CAP-ID-001");
      let snapshotReady = false;
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const current = (await readdir(tmpdir())).find(
          (name) =>
            name.startsWith("huoqiu-snapshot-") &&
            !snapshotDirectories.has(name),
        );
        if (current !== undefined) {
          snapshotReady = await readdir(resolve(tmpdir(), current, "worktree"))
            .then(() => true)
            .catch(() => false);
        }
        if (snapshotReady) break;
        await new Promise<void>((resolvePromise) =>
          setTimeout(resolvePromise, 2),
        );
      }
      expect(snapshotReady).toBe(true);
      await rename(launcherPath, originalPath);
      await rename(maliciousPath, launcherPath);
      try {
        await resultPromise.catch(() => undefined);
      } finally {
        await rename(launcherPath, maliciousPath);
        await rename(originalPath, launcherPath);
        await chmod(launcherPath, 0o700);
      }
      await expect(readFile(marker)).rejects.toThrow();
    },
  );

  it("does not execute repository-local Git hooks while preparing a snapshot", async () => {
    const root = await setupRepository();
    const marker = resolve(root, "candidate-git-hook-executed");
    const hookPath = resolve(root, ".git/hooks/post-checkout");
    await writeFile(
      hookPath,
      [
        "#!/usr/bin/env node",
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped');`,
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(hookPath, 0o700);
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).resolves.toMatchObject({ cap_id: "CAP-ID-001" });
    await expect(readFile(marker)).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")(
    "does not execute repository-local Git smudge filters while preparing a snapshot",
    async () => {
      const root = await setupRepository();
      const marker = resolve(root, ".git/candidate-smudge-filter-executed");
      const filterPath = resolve(root, ".git/candidate-smudge-filter.cjs");
      await writeFile(
        filterPath,
        [
          "const { writeFileSync } = require('node:fs');",
          `writeFileSync(${JSON.stringify(marker)}, 'escaped');`,
          "process.stdin.pipe(process.stdout);",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        resolve(root, ".gitattributes"),
        "filtered.txt filter=attack\n",
        "utf8",
      );
      await writeFile(
        resolve(root, "filtered.txt"),
        "candidate bytes\n",
        "utf8",
      );
      await execFile(
        "git",
        ["config", "filter.attack.smudge", `${process.execPath} ${filterPath}`],
        {
          cwd: root,
        },
      );
      await execFile("git", ["add", ".gitattributes", "filtered.txt"], {
        cwd: root,
      });
      await execFile("git", ["commit", "-q", "-m", "candidate smudge filter"], {
        cwd: root,
      });
      await expect(
        runTrustedCapability(root, "d0", "CAP-ID-001"),
      ).resolves.toMatchObject({ cap_id: "CAP-ID-001" });
      await expect(readFile(marker)).rejects.toThrow();
    },
  );

  it("rechecks repository context after a capability command before writing evidence", async () => {
    const root = await setupRepository();
    const manifestPath = resolve(root, "quality/manifests/d0-required.json");
    const manifest = await json(manifestPath);
    const requiredCaps = manifest.required_caps as Record<string, unknown>[];
    const firstCap = requiredCaps[0];
    if (firstCap === undefined) throw new Error("missing test capability");
    const summary = `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
      fixture_version: "d0.v1",
      passed: 1,
      failed: 0,
      skipped: 0,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    })}`;
    firstCap.command = await writeCapabilityProgram(
      root,
      "mutating-capability",
      [
        "import { appendFileSync } from 'node:fs';",
        "appendFileSync('packages/contracts/src/d0/contract.ts', ' ');",
        `console.log(${JSON.stringify(summary)});`,
        "",
      ].join("\n"),
    );
    await writeJson(manifestPath, manifest);
    await execFile(
      "git",
      [
        "add",
        "quality/manifests/d0-required.json",
        "scripts/quality/mutating-capability.mjs",
      ],
      { cwd: root },
    );
    await execFile("git", ["commit", "-q", "-m", "mutating capability"], {
      cwd: root,
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("CONTEXT_CHANGED_DURING_EXECUTION");
  });

  it("detects a tracked write even when the command restores the original bytes", async () => {
    const root = await setupRepository();
    const manifestPath = resolve(root, "quality/manifests/d0-required.json");
    const manifest = await json(manifestPath);
    const requiredCaps = manifest.required_caps as Record<string, unknown>[];
    const firstCap = requiredCaps[0];
    if (firstCap === undefined) throw new Error("missing test capability");
    const summary = `HUOQIU_CAPABILITY_RESULT ${JSON.stringify({
      fixture_version: "d0.v1",
      passed: 1,
      failed: 0,
      skipped: 0,
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
    })}`;
    firstCap.command = await writeCapabilityProgram(
      root,
      "restoring-capability",
      [
        "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';",
        "const path = 'packages/contracts/src/d0/contract.ts';",
        "const before = readFileSync(path);",
        "appendFileSync(path, 'attack');",
        "writeFileSync(path, before);",
        `console.log(${JSON.stringify(summary)});`,
        "",
      ].join("\n"),
    );
    await writeJson(manifestPath, manifest);
    await execFile(
      "git",
      [
        "add",
        "quality/manifests/d0-required.json",
        "scripts/quality/restoring-capability.mjs",
      ],
      { cwd: root },
    );
    await execFile("git", ["commit", "-q", "-m", "restore mutation attack"], {
      cwd: root,
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("CONTEXT_CHANGED_DURING_EXECUTION");
  });

  it("detects modify-restore writes from dependency installation", async () => {
    const root = await setupRepository();
    await writeJson(resolve(root, "package.json"), {
      name: "snapshot-install-attack",
      version: "1.0.0",
      private: true,
      scripts: { postinstall: "node install-attack.cjs" },
      packageManager: "pnpm@11.4.0",
    });
    await writeFile(
      resolve(root, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '9.0'",
        "settings:",
        "  autoInstallPeers: true",
        "  excludeLinksFromLockfile: false",
        "importers:",
        "  .: {}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      resolve(root, "install-attack.cjs"),
      [
        "const fs = require('node:fs');",
        "const path = 'packages/contracts/src/d0/contract.ts';",
        "const original = fs.readFileSync(path);",
        "fs.appendFileSync(path, 'install-attack');",
        "fs.writeFileSync(path, original);",
        "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);",
        "",
      ].join("\n"),
      "utf8",
    );
    await execFile("git", ["add", "."], { cwd: root });
    await execFile("git", ["commit", "-q", "-m", "install mutation attack"], {
      cwd: root,
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("CONTEXT_CHANGED_DURING_EXECUTION");
  });

  it("rejects assembling evidence from caller-supplied raw reports", async () => {
    const root = await setupRepository();
    const context = await computeCurrentContext(root, "d0");
    const path = rawReportPath(context.commit_sha, "d0", "CAP-ID-001");
    await writeEvidenceFileForTesting(root, path, {
      schema_version: 1,
      command: successCommand("d0.v1"),
      started_at: "2026-08-08T00:00:00.000Z",
      finished_at: "2026-08-08T00:00:01.000Z",
      exit_code: 0,
      signal: null,
      stdout: successCommand("d0.v1").args.at(-1),
      stderr: "",
    });
    await expect(
      assembleEvidenceFromRawReport(root, "d0", "CAP-ID-001", path),
    ).rejects.toThrow("UNTRUSTED_RAW_REPORT");
  });

  it("keeps final gate verification read-only and never overwrites evidence", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(
      root,
      evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    const before = await readFile(path, "utf8");
    await expect(runTrustedGate(root, "d0")).resolves.toContain("D0_GATE PASS");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("rejects evidence bytes changed after the signed review", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(
      root,
      evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    const evidence = await json(path);
    const environment = evidence.environment as Record<string, unknown>;
    environment.platform = "tampered-platform";
    await writeJson(path, evidence);
    await expect(runTrustedGate(root, "d0")).rejects.toThrow(
      "EVIDENCE_SET_MISMATCH",
    );
  });

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
      await expect(runTrustedGate(root, "d0")).rejects.toThrow(
        field === "commit_sha" ? "EVIDENCE_SCHEMA_INVALID" : "STALE_EVIDENCE",
      );
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
      await expect(runTrustedGate(root, "d0")).rejects.toThrow(
        "STALE_EVIDENCE",
      );
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
    await expect(runTrustedGate(root, "d0")).rejects.toThrow(
      "EVIDENCE_SCHEMA_INVALID",
    );
  });

  it("rejects raw report bytes that do not match the recorded SHA-256", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(
      root,
      rawReportPath(context.commit_sha, "d0", "CAP-ID-001"),
    );
    await writeFile(path, "tampered\n");
    await expect(runTrustedGate(root, "d0")).rejects.toThrow(
      "RAW_REPORT_HASH_MISMATCH",
    );
  });

  it("rejects self review while recording", async () => {
    const root = await setupRepository();
    const manifestPath = resolve(root, "quality/manifests/d0-required.json");
    const manifest = await json(manifestPath);
    for (const item of manifest.required_caps as Record<string, unknown>[]) {
      item.implementer_ids = ["github:200"];
    }
    await writeJson(manifestPath, manifest);
    await execFile("git", ["add", "quality/manifests/d0-required.json"], {
      cwd: root,
    });
    await execFile("git", ["commit", "-q", "-m", "reviewer implemented caps"], {
      cwd: root,
    });
    await refreshAuthorship(root, "d0", ["github:200"]);
    for (const capId of D0_REQUIRED_CAP_IDS)
      await runTrustedCapability(root, "d0", capId);
    const context = await computeCurrentContext(root, "d0");
    await writeChecklistForTesting(root, "d0", context.commit_sha, [
      "functional",
      "quality",
    ]);
    await expect(
      recordReview(root, "d0", context.commit_sha, signingOptions(root)),
    ).rejects.toThrow("INDEPENDENT_REVIEW_REQUIRED");
  });

  it("rejects checklist counters that do not match strict finding severities", async () => {
    const root = await setupRepository();
    for (const capId of D0_REQUIRED_CAP_IDS)
      await runTrustedCapability(root, "d0", capId);
    const context = await computeCurrentContext(root, "d0");
    await writeEvidenceFileForTesting(
      root,
      checklistPath(context.commit_sha, "d0"),
      {
        schema_version: 1,
        milestone: "d0",
        commit_sha: context.commit_sha,
        p0: 0,
        p1: 0,
        findings: [
          {
            id: "F-001",
            severity: "P0",
            summary: "blocking finding",
            evidence_refs: [
              evidencePath(context.commit_sha, "d0", "CAP-ID-001"),
            ],
          },
        ],
        reviewed_dimensions: ["functional", "quality"],
      },
    );
    await expect(
      recordReview(root, "d0", context.commit_sha, signingOptions(root)),
    ).rejects.toThrow("REVIEW_CHECKLIST_INVALID");
  });

  it("rejects arbitrary review dimensions", async () => {
    const root = await setupRepository();
    for (const capId of D0_REQUIRED_CAP_IDS)
      await runTrustedCapability(root, "d0", capId);
    const context = await computeCurrentContext(root, "d0");
    await writeChecklistForTesting(root, "d0", context.commit_sha, [
      "invented",
    ]);
    await expect(
      recordReview(root, "d0", context.commit_sha, signingOptions(root)),
    ).rejects.toThrow("REVIEW_DIMENSION_INVALID");
  });

  it("requires review time to be at or after the latest evidence", async () => {
    const root = await setupRepository();
    for (const capId of D0_REQUIRED_CAP_IDS)
      await runTrustedCapability(root, "d0", capId);
    const context = await computeCurrentContext(root, "d0");
    await writeChecklistForTesting(root, "d0", context.commit_sha, [
      "functional",
      "quality",
    ]);
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {}, () => new Date("2000-01-01T00:00:00.000Z")),
      ),
    ).rejects.toThrow("REVIEW_TIME_INVALID");
  });
});

describe("trusted reviewer identity boundary", () => {
  it("accepts only complete protected GitHub Actions provenance", async () => {
    const root = await setupRepository();
    expect(
      resolveTrustedReviewerIdentity(reviewEnvironments.get(root)),
    ).toMatchObject({
      reviewer_id: "github:200",
      source: {
        provider: "github-actions",
        actor: "quality-reviewer",
        actor_id: "200",
        repository: "huoqiu/huoqiu",
        ref: "refs/heads/main",
        ref_protected: true,
        protected_environment: "quality-review",
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

  it("requires the literal /.github/workflows/ segment", async () => {
    const root = await setupRepository();
    expect(() =>
      resolveTrustedReviewerIdentity({
        ...reviewEnvironments.get(root),
        GITHUB_WORKFLOW_REF:
          "huoqiu/huoqiu/xgithub/workflows/quality-review.yml@refs/heads/main",
      }),
    ).toThrow("TRUSTED_REVIEWER_IDENTITY_REQUIRED");
  });

  it("does not treat a candidate registry and candidate key as a trust root", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_VERIFIER_ROOT_PUBLIC_KEY_SPKI_B64: undefined,
          HUOQIU_VERIFIER_ROOT_KEY_ID: undefined,
        }),
      ),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_TRUST_REGISTRY_EPOCH: "2",
        }),
      ),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
  });

  it("pins the exact current registry digest to prevent same-epoch equivocation", async () => {
    const root = await setupRepository();
    await rewriteSignedRegistry(root, (registry) => {
      registry.expires_at = "2098-01-01T00:00:00.000Z";
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
  });

  it("validates the protected previous digest for an epoch transition", async () => {
    const root = await setupRepository();
    const previousBytes = await readFile(
      resolve(root, "quality/reviewers/trust-registry.v2.json"),
    );
    const previousDigest = createHash("sha256")
      .update(previousBytes)
      .digest("hex");
    const currentDigest = await rewriteSignedRegistry(root, (registry) => {
      registry.epoch = 2;
      registry.previous_registry_sha256 = previousDigest;
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_EPOCH = "2";
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = currentDigest;
    environment.HUOQIU_TRUST_REGISTRY_PREVIOUS_SHA256 = "2".repeat(64);
    environment.HUOQIU_TRUST_REGISTRY_HISTORY_B64 = registryHistoryEnvironment([
      previousBytes,
    ]);
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
  });

  it("rejects epoch 2 when only a matching digest pin is supplied without previous registry bytes", async () => {
    const root = await setupRepository();
    const previousBytes = await readFile(
      resolve(root, "quality/reviewers/trust-registry.v2.json"),
    );
    const previousDigest = createHash("sha256")
      .update(previousBytes)
      .digest("hex");
    const currentDigest = await rewriteSignedRegistry(root, (registry) => {
      registry.epoch = 2;
      registry.previous_registry_sha256 = previousDigest;
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_EPOCH = "2";
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = currentDigest;
    environment.HUOQIU_TRUST_REGISTRY_PREVIOUS_SHA256 = previousDigest;
    delete environment.HUOQIU_TRUST_REGISTRY_HISTORY_B64;
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("REVIEW_TRUST_REGISTRY_INVALID");
  });

  it("accepts an exact signed epoch chain whose raw bytes link through N-1", async () => {
    const root = await setupRepository();
    const epoch1Bytes = await readFile(
      resolve(root, "quality/reviewers/trust-registry.v2.json"),
    );
    const epoch1Digest = createHash("sha256").update(epoch1Bytes).digest("hex");
    await rewriteSignedRegistry(root, (registry) => {
      registry.epoch = 2;
      registry.previous_registry_sha256 = epoch1Digest;
    });
    const epoch2Bytes = await readFile(
      resolve(root, "quality/reviewers/trust-registry.v2.json"),
    );
    const epoch2Digest = createHash("sha256").update(epoch2Bytes).digest("hex");
    const currentDigest = await rewriteSignedRegistry(root, (registry) => {
      registry.epoch = 3;
      registry.previous_registry_sha256 = epoch2Digest;
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_EPOCH = "3";
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = currentDigest;
    environment.HUOQIU_TRUST_REGISTRY_PREVIOUS_SHA256 = epoch2Digest;
    environment.HUOQIU_TRUST_REGISTRY_HISTORY_B64 = registryHistoryEnvironment([
      epoch1Bytes,
      epoch2Bytes,
    ]);
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).resolves.toMatchObject({ cap_id: "CAP-ID-001" });
  });

  it("rejects a root-signed previous registry from another repository", async () => {
    const root = await setupRepository();
    const foreignEpoch1 = await signedRegistryBytes(root, (registry) => {
      registry.repository_id = "9002";
      const keys = registry.keys as Record<string, Record<string, unknown>>;
      for (const policy of Object.values(keys)) policy.repository_id = "9002";
    });
    const foreignDigest = createHash("sha256")
      .update(foreignEpoch1)
      .digest("hex");
    const currentDigest = await rewriteSignedRegistry(root, (registry) => {
      registry.epoch = 2;
      registry.previous_registry_sha256 = foreignDigest;
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_EPOCH = "2";
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = currentDigest;
    environment.HUOQIU_TRUST_REGISTRY_PREVIOUS_SHA256 = foreignDigest;
    environment.HUOQIU_TRUST_REGISTRY_HISTORY_B64 = registryHistoryEnvironment([
      foreignEpoch1,
    ]);
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("REVIEW_TRUST_REGISTRY_INVALID");
  });

  it("measures the actual verifier entrypoint instead of trusting a digest string", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_VERIFIER_ENTRYPOINT_PATH: resolve(
            root,
            "quality/gate-config.v1.json",
          ),
        }),
      ),
    ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
  });

  it.skipIf(process.platform === "win32")(
    "rejects a symbolic alias for the protected verifier entrypoint",
    async () => {
      const root = await setupRepository();
      const context = await prepareReviewInputs(root, "d0");
      const environment = reviewEnvironments.get(root);
      const actualPath = environment?.HUOQIU_VERIFIER_ENTRYPOINT_PATH;
      if (actualPath === undefined)
        throw new Error("missing protected verifier entrypoint");
      const aliasRoot = await mkdtemp(
        resolve(tmpdir(), "huoqiu-verifier-alias-"),
      );
      temporaryRoots.push(aliasRoot);
      const aliasPath = resolve(aliasRoot, "verifier-entrypoint");
      await symlink(actualPath, aliasPath, "file");
      await expect(
        recordReview(
          root,
          "d0",
          context.commit_sha,
          signingOptions(root, {
            HUOQIU_VERIFIER_ENTRYPOINT_PATH: aliasPath,
          }),
        ),
      ).rejects.toThrow("VERIFIER_TRUST_ROOT_REQUIRED");
    },
  );

  it("requires a signed authorship statement for the exact reviewed commit", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await rm(
      resolve(
        root,
        `artifacts/evidence/${context.commit_sha}/authorship.v1.json`,
      ),
      { force: true },
    );
    await expect(
      recordReview(root, "d0", context.commit_sha, signingOptions(root)),
    ).rejects.toThrow("AUTHORSHIP_ATTESTATION_REQUIRED");
  });

  it("rejects candidate-authored implementer replacement metadata", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await writeEvidenceFileForTesting(
      root,
      `artifacts/evidence/${context.commit_sha}/authorship.v1.json`,
      { implementer_ids: ["github:999"] },
    );
    await expect(
      recordReview(root, "d0", context.commit_sha, signingOptions(root)),
    ).rejects.toThrow("AUTHORSHIP_ATTESTATION_INVALID");
  });

  it("derives multiple implementers only from the exact protected archive bytes", async () => {
    const root = await setupRepository();
    const head = (
      await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    installAuthorshipArchive(root, head, ["101", "100"]);
    const environment = authorshipEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing authorship environment");
    const attestation = await recordAuthorship(root, head, {
      milestone: "d0",
      environment,
    });
    expect(attestation.implementer_ids).toEqual(["github:100", "github:101"]);
  });

  it("rejects protected authorship archive bytes that do not match their digest", async () => {
    const root = await setupRepository();
    const head = (
      await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    installAuthorshipArchive(root, head, ["100"]);
    const environment = authorshipEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing authorship environment");
    const archive = Buffer.from(
      String(environment.HUOQIU_AUTHORSHIP_ARCHIVE_B64),
      "base64",
    );
    environment.HUOQIU_AUTHORSHIP_ARCHIVE_B64 = Buffer.concat([
      archive,
      Buffer.from(" ", "utf8"),
    ]).toString("base64");
    await expect(
      recordAuthorship(root, head, { milestone: "d0", environment }),
    ).rejects.toThrow("AUTHORSHIP_IDENTITY_NOT_CONFIGURED");
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

  it("rejects a CLI authorship issuer override before touching repository state", async () => {
    await expect(
      recordAuthorshipMain([
        "--milestone",
        "d0",
        "--commit-sha",
        "a".repeat(40),
        "--issuer-id",
        "github:999",
      ]),
    ).rejects.toThrow("CLI_ARGUMENT_INVALID");
  });

  it("records authorship without caller-supplied implementer flags", async () => {
    const root = await setupRepository();
    const head = (
      await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    await expect(
      recordAuthorshipMain(
        ["--milestone", "d0", "--commit-sha", head],
        root,
        authorshipEnvironments.get(root),
      ),
    ).resolves.toBeUndefined();
  });

  it("records a versioned Ed25519 signature over evidence and provenance", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    const review = (await recordReview(
      root,
      "d0",
      context.commit_sha,
      signingOptions(root),
    )) as unknown as Record<string, unknown>;
    const signature = review.signature as Record<string, unknown>;
    const environment = reviewEnvironments.get(root);
    expect(review.schema_version).toBe(3);
    expect(review.evidence_set_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(review.trust_registry_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(review.verifier_root_key_id).toMatch(/^ed25519:[a-f0-9]{64}$/);
    expect(review.authorship_attestation_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(signature.algorithm).toBe("Ed25519");
    expect(signature.key_id).toBe(environment?.HUOQIU_REVIEW_KEY_ID);
    const bytes = Buffer.from(String(signature.value_base64), "base64");
    expect(bytes.byteLength).toBe(64);
    expect(bytes.toString("base64")).toBe(signature.value_base64);
  });

  it("fails closed when the trust registry has no authorized key", async () => {
    const root = await setupRepository();
    const registryPath = resolve(
      root,
      "quality/reviewers/trust-registry.v2.json",
    );
    const emptyRegistry = await json(registryPath);
    emptyRegistry.keys = {};
    emptyRegistry.signature = null;
    await writeJson(registryPath, emptyRegistry);
    await execFile("git", ["add", "quality/reviewers/trust-registry.v2.json"], {
      cwd: root,
    });
    await execFile("git", ["commit", "-q", "-m", "empty reviewer trust"], {
      cwd: root,
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = createHash("sha256")
      .update(await readFile(registryPath))
      .digest("hex");
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("REVIEW_TRUST_REQUIRED");
  });

  it("rejects malformed trust-policy provenance before key authorization", async () => {
    const root = await setupRepository();
    const registryPath = resolve(
      root,
      "quality/reviewers/trust-registry.v2.json",
    );
    const registry = await json(registryPath);
    const keys = registry.keys as Record<string, Record<string, unknown>>;
    const policy = Object.values(keys)[0];
    if (policy === undefined) throw new Error("missing test trust policy");
    policy.repository_id = "not-numeric";
    await writeJson(registryPath, registry);
    await execFile("git", ["add", "quality/reviewers/trust-registry.v2.json"], {
      cwd: root,
    });
    await execFile("git", ["commit", "-q", "-m", "malformed trust policy"], {
      cwd: root,
    });
    const environment = reviewEnvironments.get(root);
    if (environment === undefined)
      throw new Error("missing review environment");
    environment.HUOQIU_TRUST_REGISTRY_SHA256 = createHash("sha256")
      .update(await readFile(registryPath))
      .digest("hex");
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("REVIEW_TRUST_REGISTRY_INVALID");
  });

  it("rejects an unknown key ID and a private key that does not match the registry", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_REVIEW_KEY_ID: `ed25519:${"0".repeat(64)}`,
        }),
      ),
    ).rejects.toThrow("REVIEW_TRUST_REQUIRED");

    const { privateKey } = generateKeyPairSync("ed25519");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_REVIEW_PRIVATE_KEY_B64: Buffer.from(
            privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
          ).toString("base64"),
        }),
      ),
    ).rejects.toThrow("REVIEW_PRIVATE_KEY_MISMATCH");
  });

  it("rejects forged local provenance, unprotected refs, and trust-policy mismatch", async () => {
    const root = await setupRepository();
    const context = await prepareReviewInputs(root, "d0");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, {
          HUOQIU_REVIEW_KEY_ID: undefined,
          HUOQIU_REVIEW_PRIVATE_KEY_B64: undefined,
        }),
      ),
    ).rejects.toThrow("REVIEW_TRUST_REQUIRED");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, { GITHUB_REF_PROTECTED: "false" }),
      ),
    ).rejects.toThrow("TRUSTED_REVIEWER_IDENTITY_REQUIRED");
    await expect(
      recordReview(
        root,
        "d0",
        context.commit_sha,
        signingOptions(root, { GITHUB_REF: "refs/heads/attacker" }),
      ),
    ).rejects.toThrow("REVIEW_TRUST_POLICY_MISMATCH");
  });

  it("rejects signed provenance tampering during verification", async () => {
    const root = await prepareReviewedGate();
    const context = await computeCurrentContext(root, "d0");
    const path = resolve(root, reviewPath(context.commit_sha, "d0"));
    const review = await json(path);
    (review.reviewer_source as Record<string, unknown>).ref =
      "refs/heads/attacker";
    await writeJson(path, review);
    await expect(runTrustedGate(root, "d0")).rejects.toThrow(
      "REVIEW_SIGNATURE_INVALID",
    );
  });
});

describe("milestone results and explicit not-ready behavior", () => {
  it("reports an approved pending capability before loading future inputs", async () => {
    const root = await setupRepository();
    const manifestPath = resolve(root, "quality/manifests/d0-required.json");
    const manifest = await json(manifestPath);
    const first = (manifest.required_caps as Record<string, unknown>[])[0];
    if (first === undefined) throw new Error("missing test capability");
    first.command = {
      executable: "pnpm",
      args: [
        "exec",
        "tsx",
        "scripts/quality/not-implemented-gate.mts",
        "--cap",
        "CAP-ID-001",
      ],
    };
    first.implementer_ids = ["pending:capability-implementation"];
    await writeJson(manifestPath, manifest);
    await rm(resolve(root, "packages/contracts/src/d0"), {
      recursive: true,
      force: true,
    });
    await expect(
      runTrustedCapability(root, "d0", "CAP-ID-001"),
    ).rejects.toThrow("NOT_IMPLEMENTED");
  });
  it("executes D0 commands and prints the exact successful line", async () => {
    const root = await prepareReviewedGate("d0");
    await expect(runTrustedGate(root, "d0")).resolves.toBe(
      "D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0",
    );
  });

  it("prints the exact M1 successful line only after all ten capabilities", async () => {
    const root = await prepareReviewedGate("m1");
    await expect(runTrustedGate(root, "m1")).resolves.toBe(
      "M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0",
    );
  });

  it("requires the M1 final gate to use the release-dimension review path", async () => {
    const root = await prepareReviewedGate("m1");
    const context = await computeCurrentContext(root, "m1");
    await copyFile(
      resolve(root, reviewPath(context.commit_sha, "m1", "release")),
      resolve(root, reviewPath(context.commit_sha, "m1")),
    );
    await rm(resolve(root, reviewPath(context.commit_sha, "m1", "release")));
    await expect(runTrustedGate(root, "m1")).rejects.toThrow(
      "INDEPENDENT_REVIEW_REQUIRED",
    );
  });

  it("future gate placeholder is explicit non-zero behavior, never PASS", async () => {
    await expect(
      notImplementedMain(
        ["--gate", "security"],
        "unknown",
        new Set(["--gate"]),
      ),
    ).rejects.toThrow("NOT_IMPLEMENTED");
  });

  it("registered future qa modules fail explicitly instead of module resolution errors", async () => {
    const result = await executeCommand(sourceRoot, {
      executable: "pnpm",
      args: ["exec", "tsx", "scripts/quality/auth-spike-gate.mts"],
    });
    expect(result.exit_code).not.toBe(0);
    expect(result.stderr).toContain("NOT_IMPLEMENTED");
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });

  it("enforces pending wrappers and the implemented mobile CLI argument contracts", async () => {
    await expect(e2eGateMain(["--milestone", "m1"])).rejects.toThrow(
      "NOT_IMPLEMENTED",
    );
    await expect(e2eGateMain(["--platform", "ios"])).rejects.toThrow(
      "CLI_ARGUMENT_INVALID",
    );
    await expect(mobileD0Main(["--milestone", "d0"])).rejects.toThrow(
      "CLI_ARGUMENT_INVALID",
    );
    await expect(buildMobileArtifactsMain([])).rejects.toThrow(
      "NOT_IMPLEMENTED",
    );
    await expect(
      buildMobileArtifactsMain(["--gate", "release"]),
    ).rejects.toThrow("CLI_ARGUMENT_INVALID");
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
    const authorshipSchema = await json(
      resolve(sourceRoot, "quality/evidence/authorship.schema.json"),
    );
    const authorshipInputSchema = await json(
      resolve(sourceRoot, "quality/evidence/authorship-input.schema.json"),
    );
    const registrySchema = await json(
      resolve(sourceRoot, "quality/reviewers/trust-registry.schema.json"),
    );
    expect(evidenceSchema.additionalProperties).toBe(false);
    expect(reviewSchema.additionalProperties).toBe(false);
    expect(authorshipSchema.additionalProperties).toBe(false);
    expect(authorshipInputSchema.additionalProperties).toBe(false);
    expect(authorshipInputSchema.required).toContain("contributors");
    expect(registrySchema.additionalProperties).toBe(false);
    expect(
      (reviewSchema.properties as Record<string, Record<string, unknown>>)
        .schema_version?.const,
    ).toBe(3);
    expect(reviewSchema["x-huoqiu-not-in"]).toBeUndefined();
    expect(reviewSchema.$comment).toContain("runtime validateReview");
    expect(evidenceSchema.$comment).toContain("runtime validateCommand");
    const definitions = evidenceSchema.$defs as Record<
      string,
      Record<string, unknown>
    >;
    const command = definitions.command;
    const properties = command?.properties as
      Record<string, Record<string, unknown>> | undefined;
    const executablePattern = properties?.executable?.pattern;
    expect(typeof executablePattern).toBe("string");
    const executableRegex = new RegExp(String(executablePattern));
    expect(executableRegex.test("/bin/sh")).toBe(false);
    expect(executableRegex.test("node")).toBe(true);
  });

  it("loads the real manifests without letting them redefine the oracle", async () => {
    const root = await setupRepository();
    const { manifest } = await loadInputsForTesting(root, "d0");
    expect(manifest.required_caps.map((item) => item.cap_id)).toEqual(
      D0_REQUIRED_CAP_IDS,
    );
  });
});
