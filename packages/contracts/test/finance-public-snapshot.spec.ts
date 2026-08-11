import { describe, expect, it } from "vitest";

import { publicFinanceSnapshotSchema } from "../src/finance/public-snapshot-v1.js";

const descriptor = {
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
} as const;

const normalizedRecord = {
  sourceRecordId: "0000320193-26-000001",
  kind: "filing",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/index.html",
  publishedAt: "2026-08-12T00:00:00.000Z",
  fetchedAt: "2026-08-12T00:05:00.000Z",
  lastSeenAt: "2026-08-12T00:05:00.000Z",
  publisher: {
    name: "U.S. Securities and Exchange Commission",
    identifier: "sec-edgar",
    url: "https://www.sec.gov/edgar/search/",
  },
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
} as const;

const validSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-08-12T00:05:00.000Z",
  sources: [
    {
      descriptor,
      lastRunStatus: "ready",
      lastAttemptAt: "2026-08-12T00:05:00.000Z",
      lastSuccessAt: "2026-08-12T00:05:00.000Z",
      staleAt: "2026-08-12T00:20:00.000Z",
    },
  ],
  records: [normalizedRecord],
} as const;

describe("public finance snapshot contract", () => {
  it("accepts a bounded real-source snapshot with source status", () => {
    expect(publicFinanceSnapshotSchema.parse(validSnapshot)).toEqual(
      validSnapshot,
    );
  });

  it("rejects synthetic provenance and undisclosed body-like fields", () => {
    expect(() =>
      publicFinanceSnapshotSchema.parse({
        ...validSnapshot,
        sources: [
          {
            ...validSnapshot.sources[0],
            descriptor: {
              ...descriptor,
              sourceMode: "synthetic",
            },
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      publicFinanceSnapshotSchema.parse({
        ...validSnapshot,
        records: [
          {
            ...normalizedRecord,
            content: {
              ...normalizedRecord.content,
              body: "must never enter a public snapshot",
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate sources, orphan records and more than 250 records", () => {
    expect(() =>
      publicFinanceSnapshotSchema.parse({
        ...validSnapshot,
        sources: [...validSnapshot.sources, ...validSnapshot.sources],
      }),
    ).toThrow();

    expect(() =>
      publicFinanceSnapshotSchema.parse({
        ...validSnapshot,
        records: [
          {
            ...normalizedRecord,
            provenance: { ...descriptor, source: "unknown-source" },
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      publicFinanceSnapshotSchema.parse({
        ...validSnapshot,
        records: Array.from({ length: 251 }, (_, index) => ({
          ...normalizedRecord,
          sourceRecordId: `record-${index}`,
        })),
      }),
    ).toThrow();
  });
});
