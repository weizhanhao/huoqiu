import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const oracleDirectory = "quality/oracles/m1";
const oracleFiles = [
  "api-operations.v1.json",
  "event-types.v1.json",
  "fixture-policy.v1.json",
] as const;

// This digest is the independently approved root of trust. A candidate may
// recompute approved.sha256, but it cannot change this value without changing
// the already-reviewed test in the same diff.
const APPROVED_MANIFEST_SHA256 =
  "0c376914b40f6f9a7a419bb8f277fdce0cb8fdce47a6310de6ea2e891f948675";

const expectedApiIds = [
  "API-AUTH-001",
  "API-AUTH-002",
  "API-AUTH-003",
  "API-AUTH-004",
  "API-INST-001",
  "API-INST-002",
  "API-MD-001",
  "API-MD-002",
  "API-FEED-001",
  "API-WATCH-001",
  "API-WATCH-002",
  "API-WATCH-003",
  "API-POST-001",
  "API-POST-002",
  "API-COMMENT-000",
  "API-COMMENT-001",
  "API-REACTION-001",
  "API-REACTION-002",
  "API-NOTIF-001",
  "API-NOTIF-002",
  "API-NOTIF-003",
  "API-REPORT-001",
  "API-MOD-001",
  "API-MOD-002",
  "API-PORT-000",
  "API-PORT-001",
  "API-PORT-002",
  "API-PORT-003",
  "API-PORT-004",
  "API-PORT-005",
  "API-PORT-006",
] as const;

const expectedEventTypes = [
  "identity.user_registered",
  "content.post_submitted",
  "moderation.decision_recorded",
  "content.post_published",
  "content.post_hidden",
  "content.post_restored",
  "identity.user_suspended",
  "social.comment_submitted",
  "social.comment_published",
  "social.comment_hidden",
  "social.comment_restored",
  "social.reaction_changed",
  "watchlist.item_changed",
  "notification.created",
  "notification.read_watermark_advanced",
  "moderation.report_submitted",
  "portfolio.ledger_entry_posted",
  "market.quote_revised",
] as const;

const expectedAllowedSurfaces = [
  "identity",
  "instrument",
  "market_data",
  "feed",
  "watchlist",
  "content",
  "social",
  "notification",
  "moderation",
  "portfolio_private",
] as const;

const expectedForbiddenPiiKeys = [
  "access_token",
  "auth_token",
  "email",
  "full_name",
  "legal_name",
  "mobile",
  "phone",
  "phone_number",
  "real_name",
  "refresh_token",
  "session",
  "session_id",
  "token",
] as const;

const temporaryRoots: string[] = [];

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

function expectExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  expect(value, label).not.toBeNull();
  expect(Array.isArray(value), label).toBe(false);
  expect(typeof value, label).toBe("object");
  expect(Object.keys(value as object).sort(), label).toEqual(
    [...expected].sort(),
  );
}

const expectStableJson = (raw: string, value: unknown, label: string): void => {
  expect(raw.endsWith("\n"), `${label} must have a final newline`).toBe(true);
  expect(raw, `${label} must use LF line endings`).not.toContain("\r");
  expect(raw, `${label} must not have trailing line whitespace`).not.toMatch(
    /[\t ]+$/m,
  );
  expect(JSON.parse(raw), `${label} must round-trip without data loss`).toEqual(
    value,
  );
};

const loadJson = async (root: string, name: string): Promise<unknown> => {
  const path = resolve(root, oracleDirectory, name);
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  expectStableJson(raw, parsed, name);
  return parsed;
};

const verifyApprovedManifest = async (root: string): Promise<void> => {
  const manifestPath = resolve(root, oracleDirectory, "approved.sha256");
  const manifest = await readFile(manifestPath, "utf8");
  expect(sha256(manifest), "approved.sha256 fixed approval digest").toBe(
    APPROVED_MANIFEST_SHA256,
  );

  const records = manifest.trimEnd().split("\n");
  expect(records).toHaveLength(oracleFiles.length);
  for (const [index, file] of oracleFiles.entries()) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(records[index] ?? "");
    expect(match, `approved.sha256 line ${index + 1}`).not.toBeNull();
    const expectedPath = `${oracleDirectory}/${file}`;
    expect(match?.[2]).toBe(expectedPath);
    const bytes = await readFile(resolve(root, expectedPath));
    expect(sha256(bytes), `${file} approved sha256`).toBe(match?.[1]);
  }
};

const verifyOracleBundle = async (root: string): Promise<void> => {
  // Approval is checked before candidate-controlled JSON is parsed.
  await verifyApprovedManifest(root);

  const operations = await loadJson(root, oracleFiles[0]);
  expect(Array.isArray(operations)).toBe(true);
  expect(operations).toHaveLength(31);
  for (const [index, operation] of (operations as unknown[]).entries()) {
    expectExactKeys(
      operation,
      ["api_id", "operation_id", "method", "path", "cap_id", "action"],
      `operation ${index}`,
    );
    for (const key of [
      "api_id",
      "operation_id",
      "method",
      "path",
      "cap_id",
      "action",
    ]) {
      expect(operation[key], `operation ${index}.${key}`).toEqual(
        expect.any(String),
      );
      expect(
        (operation[key] as string).length,
        `operation ${index}.${key}`,
      ).toBeGreaterThan(0);
    }
  }
  const operationRecords = operations as Record<string, string>[];
  expect(operationRecords.map(({ api_id }) => api_id)).toEqual(expectedApiIds);
  expect(new Set(operationRecords.map(({ api_id }) => api_id)).size).toBe(31);
  expect(
    new Set(operationRecords.map(({ operation_id }) => operation_id)).size,
  ).toBe(31);
  expect(
    new Set(operationRecords.map(({ method, path }) => `${method} ${path}`))
      .size,
  ).toBe(31);

  const events = await loadJson(root, oracleFiles[1]);
  expect(Array.isArray(events)).toBe(true);
  expect(events).toHaveLength(18);
  for (const [index, event] of (events as unknown[]).entries()) {
    expectExactKeys(
      event,
      ["event_type", "producer", "version"],
      `event ${index}`,
    );
    expect(event.event_type).toEqual(expect.any(String));
    expect(event.producer).toEqual(expect.any(String));
    expect(event.version).toBe(1);
  }
  const eventRecords = events as Record<string, unknown>[];
  expect(eventRecords.map(({ event_type }) => event_type)).toEqual(
    expectedEventTypes,
  );
  expect(new Set(eventRecords.map(({ event_type }) => event_type)).size).toBe(
    18,
  );

  const fixturePolicy = await loadJson(root, oracleFiles[2]);
  expectExactKeys(
    fixturePolicy,
    ["allowed_sources", "forbidden_pii_keys", "allowed_surfaces"],
    "fixture policy",
  );
  expect(fixturePolicy.allowed_sources).toEqual(["huoqiu-synthetic"]);
  expect(fixturePolicy.forbidden_pii_keys).toEqual(expectedForbiddenPiiKeys);
  expect(fixturePolicy.allowed_surfaces).toEqual(expectedAllowedSurfaces);
};

const copyOracleBundle = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "huoqiu-m1-oracle-"));
  temporaryRoots.push(root);
  const destination = resolve(root, oracleDirectory);
  await mkdir(destination, { recursive: true });
  await cp(resolve(repositoryRoot, oracleDirectory), destination, {
    recursive: true,
  });
  return root;
};

const mutateJson = async (
  root: string,
  name: (typeof oracleFiles)[number],
  mutate: (value: unknown) => unknown,
): Promise<void> => {
  const path = resolve(root, oracleDirectory, name);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify(mutate(parsed), null, 2)}\n`);
};

const rewriteCandidateApprovalManifest = async (
  root: string,
): Promise<void> => {
  const lines = await Promise.all(
    oracleFiles.map(async (file) => {
      const relativePath = `${oracleDirectory}/${file}`;
      return `${sha256(await readFile(resolve(root, relativePath)))}  ${relativePath}`;
    }),
  );
  await writeFile(
    resolve(root, oracleDirectory, "approved.sha256"),
    `${lines.join("\n")}\n`,
  );
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("independently approved M1 oracle", () => {
  it("matches the fixed approval and exact approved catalogs", async () => {
    await verifyOracleBundle(repositoryRoot);
  });

  it("rejects a missing API operation", async () => {
    const root = await copyOracleBundle();
    await mutateJson(root, oracleFiles[0], (value) =>
      (value as unknown[]).slice(0, -1),
    );
    await expect(verifyOracleBundle(root)).rejects.toThrow();
  });

  it("rejects an added event type", async () => {
    const root = await copyOracleBundle();
    await mutateJson(root, oracleFiles[1], (value) => [
      ...(value as unknown[]),
      { event_type: "candidate.added", producer: "candidate", version: 1 },
    ]);
    await expect(verifyOracleBundle(root)).rejects.toThrow();
  });

  it("rejects field tampering", async () => {
    const root = await copyOracleBundle();
    await mutateJson(root, oracleFiles[2], (value) => ({
      ...(value as Record<string, unknown>),
      allowed_sources: ["candidate-provider"],
    }));
    await expect(verifyOracleBundle(root)).rejects.toThrow();
  });

  it("rejects a candidate that rewrites an oracle and recomputes the manifest", async () => {
    const root = await copyOracleBundle();
    await mutateJson(root, oracleFiles[0], (value) => {
      const records = value as Record<string, unknown>[];
      return records.map((record, index) =>
        index === 0 ? { ...record, operation_id: "candidateOverride" } : record,
      );
    });
    await rewriteCandidateApprovalManifest(root);

    await expect(verifyOracleBundle(root)).rejects.toThrow(
      /approved\.sha256 fixed approval digest/i,
    );
  });
});
