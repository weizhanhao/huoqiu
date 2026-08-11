import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  financeSourceDescriptorSchema,
  normalizedFinanceRecordSchema,
} from "@huoqiu/contracts/finance/ingestion-v1";

import {
  AtomicJsonPublicFinanceSnapshotStore,
  createPublicFinanceSnapshot,
} from "../src/finance/public-snapshot.js";

const temporaryDirectories: string[] = [];

const descriptor = financeSourceDescriptorSchema.parse({
  source: "sec-edgar",
  sourceMode: "real",
  entitlement: "public-filings",
  license: "sec-public-filings",
  delaySeconds: 0,
  capabilities: ["filing"],
  licenseUrl: "https://www.sec.gov/about/privacy-information",
  licenseScope: "public-reuse",
  externalDisplayAllowed: true,
  bodyStorageAllowed: false,
  imageStorageAllowed: false,
  redistributionAllowed: false,
  transformationAllowed: false,
  attributionRequired: true,
  attribution: "U.S. Securities and Exchange Commission",
  licenseVerifiedAt: "2026-08-12T00:00:00.000Z",
  termsVerifiedAt: "2026-08-12T00:00:00.000Z",
  licenseSnapshotId: "sec-policy-2026-08-12",
  officialSource: true,
  authType: "none",
  market: "us",
  languages: ["en"],
  historyStartAt: "1994-01-01T00:00:00.000Z",
  nativeCadenceSeconds: 60,
  minPollIntervalSeconds: 1,
  staleAfterSeconds: 900,
  documentedRateLimit: { status: "known", requests: 10, perSeconds: 1 },
  configuredRateLimit: { requests: 2, perSeconds: 1 },
  robotsPolicy: "not-applicable",
  robotsCheckedAt: null,
  robotsUrl: null,
  transportSecurity: "https",
  transportKind: "origin",
  transportBaseUrl: "https://data.sec.gov/",
  tlsVerification: "required",
  redirectPolicy: "error",
  rawRetentionDays: 0,
});

const record = normalizedFinanceRecordSchema.parse({
  sourceRecordId: "0000320193-26-000001",
  kind: "filing",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/index.html",
  publishedAt: "2026-08-12T00:00:00.000Z",
  fetchedAt: "2026-08-12T00:05:00.000Z",
  lastSeenAt: "2026-08-12T00:05:00.000Z",
  publisher: { name: "U.S. Securities and Exchange Commission" },
  content: {
    title: "Example issuer filed Form 8-K",
    language: "en",
    symbols: ["US.TEST"],
    topics: ["8-k", "filing"],
    attributes: {
      cik: "0000320193",
      accessionNumber: "0000320193-26-000001",
      formType: "8-K",
    },
  },
  provenance: descriptor,
  contentHash:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("public finance snapshot publisher", () => {
  it("publishes ready records with calculated source freshness", () => {
    const snapshot = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:05:00.000Z",
      publications: [
        {
          descriptor,
          attemptedAt: "2026-08-12T00:05:00.000Z",
          result: {
            status: "ready",
            source: "sec-edgar",
            sourceMode: "real",
            attempts: 1,
            fetched: 1,
            created: 1,
            updated: 0,
            duplicates: 0,
            records: [record],
          },
        },
      ],
    });

    expect(snapshot.sources[0]).toMatchObject({
      lastRunStatus: "ready",
      lastAttemptAt: "2026-08-12T00:05:00.000Z",
      lastSuccessAt: "2026-08-12T00:05:00.000Z",
      staleAt: "2026-08-12T00:20:00.000Z",
    });
    expect(snapshot.records).toEqual([record]);
  });

  it("retains the last real records when one source degrades, without synthetic fallback", () => {
    const previous = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:05:00.000Z",
      publications: [
        {
          descriptor,
          attemptedAt: "2026-08-12T00:05:00.000Z",
          result: {
            status: "ready",
            source: "sec-edgar",
            sourceMode: "real",
            attempts: 1,
            fetched: 1,
            created: 1,
            updated: 0,
            duplicates: 0,
            records: [record],
          },
        },
      ],
    });

    const degraded = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:30:00.000Z",
      previous,
      publications: [
        {
          descriptor,
          attemptedAt: "2026-08-12T00:30:00.000Z",
          result: {
            status: "degraded",
            source: "sec-edgar",
            sourceMode: "real",
            attempts: 1,
            fetched: 0,
            created: 0,
            updated: 0,
            duplicates: 0,
            records: [],
            failure: {
              stage: "fetch",
              code: "SOURCE_UNAVAILABLE",
              message: "Finance source is temporarily unavailable",
            },
          },
        },
      ],
    });

    expect(degraded.sources[0]).toMatchObject({
      lastRunStatus: "degraded",
      lastAttemptAt: "2026-08-12T00:30:00.000Z",
      lastSuccessAt: "2026-08-12T00:05:00.000Z",
      staleAt: "2026-08-12T00:20:00.000Z",
      failureCode: "SOURCE_UNAVAILABLE",
    });
    expect(degraded.records).toEqual([record]);
    expect(JSON.stringify(degraded)).not.toContain("synthetic");
  });

  it("replaces prior records with an honest empty source result", () => {
    const previous = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:05:00.000Z",
      publications: [
        {
          descriptor,
          attemptedAt: "2026-08-12T00:05:00.000Z",
          result: {
            status: "ready",
            source: "sec-edgar",
            sourceMode: "real",
            attempts: 1,
            fetched: 1,
            created: 1,
            updated: 0,
            duplicates: 0,
            records: [record],
          },
        },
      ],
    });

    const empty = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:15:00.000Z",
      previous,
      publications: [
        {
          descriptor,
          attemptedAt: "2026-08-12T00:15:00.000Z",
          result: {
            status: "ready",
            source: "sec-edgar",
            sourceMode: "real",
            attempts: 1,
            fetched: 0,
            created: 0,
            updated: 0,
            duplicates: 0,
            records: [],
          },
        },
      ],
    });

    expect(empty.sources[0]?.lastRunStatus).toBe("empty");
    expect(empty.records).toEqual([]);
  });
});

describe("atomic JSON public finance snapshot store", () => {
  it("rotates current to previous and recovers from a corrupt current file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-finance-"));
    temporaryDirectories.push(directory);
    const store = new AtomicJsonPublicFinanceSnapshotStore({ directory });

    const first = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:05:00.000Z",
      publications: [],
    });
    const second = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:10:00.000Z",
      publications: [],
    });

    await store.publish(first);
    await store.publish(second);
    expect(await store.readCurrent()).toEqual(second);
    expect(await store.readPrevious()).toEqual(first);

    await writeFile(join(directory, "public-v1.json"), "{broken", "utf8");
    expect(await store.readLatestValid()).toEqual(first);
  });

  it("rejects an oversized publication without replacing the last good file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-finance-"));
    temporaryDirectories.push(directory);
    const store = new AtomicJsonPublicFinanceSnapshotStore({
      directory,
      maxBytes: 512,
    });
    const first = createPublicFinanceSnapshot({
      generatedAt: "2026-08-12T00:05:00.000Z",
      publications: [],
    });
    await store.publish(first);

    await expect(
      store.publish({
        ...first,
        generatedAt: "2026-08-12T00:10:00.000Z",
        records: Array.from({ length: 20 }, (_, index) => ({
          ...record,
          sourceRecordId: `oversized-${index}-${"x".repeat(64)}`,
        })),
        sources: [
          {
            descriptor,
            lastRunStatus: "ready",
            lastAttemptAt: "2026-08-12T00:10:00.000Z",
            lastSuccessAt: "2026-08-12T00:10:00.000Z",
            staleAt: "2026-08-12T00:25:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow(/maximum byte size/u);

    expect(
      JSON.parse(await readFile(join(directory, "public-v1.json"), "utf8")),
    ).toEqual(first);
  });
});
