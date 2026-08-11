import { describe, expect, it } from "vitest";

import {
  FinanceSourceFetchError,
  runFinanceIngestion,
  type FinanceSourceBatch,
} from "../src/ingestion.js";
import {
  InMemoryFinanceRecordStore,
  TestFinanceSourceAdapter,
} from "../src/testing/in-memory-finance-ingestion.js";

const verifiedDisplayPolicy = {
  officialSource: true,
  authType: "none",
  market: "us",
  languages: ["en"] as ["en"],
  historyStartAt: "1990-01-01T00:00:00.000Z",
  documentedRateLimit: { status: "known", requests: 10, perSeconds: 1 },
  configuredRateLimit: { requests: 5, perSeconds: 1 },
  robotsPolicy: "not-applicable",
  robotsCheckedAt: null,
  robotsUrl: null,
  transportSecurity: "https",
  transportKind: "origin",
  transportBaseUrl: "https://example.gov/",
  tlsVerification: "required",
  redirectPolicy: "error",
  nativeCadenceSeconds: 300,
  minPollIntervalSeconds: 60,
  staleAfterSeconds: 900,
  redistributionAllowed: false,
  transformationAllowed: false,
  attributionRequired: true,
  imageStorageAllowed: false,
  termsVerifiedAt: "2026-08-10T00:00:00.000Z",
  rawRetentionDays: 7,
  licenseSnapshotId: "license_snapshot_test_v1",
} as const;

describe("finance ingestion run", () => {
  it("normalizes and persists a real source record with explicit provenance", async () => {
    const source = new TestFinanceSourceAdapter({
      descriptor: {
        ...verifiedDisplayPolicy,
        source: "official-filings",
        sourceMode: "real",
        entitlement: "public-filings",
        license: "official-open-data-v1",
        delaySeconds: 300,
        capabilities: ["filing"],
        licenseUrl: "https://example.gov/open-data-terms",
        licenseScope: "public-reuse",
        externalDisplayAllowed: true,
        bodyStorageAllowed: false,
        attribution: "Example Government Filings",
        licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
      },
      batches: [
        {
          records: [
            {
              sourceRecordId: "filing-2026-08-12-001",
              kind: "filing",
              sourceUrl: "https://example.gov/filings/001",
              publishedAt: "2026-08-12T00:00:00+08:00",
              publisher: {
                name: "Example Government Filings",
                identifier: "example-government-filings",
                url: "https://example.gov/filings",
              },
              content: {
                title: "芯片公司发布财报",
                language: "zh-CN",
                symbols: ["US.TEST"],
                topics: ["earnings", "semiconductors"],
                attributes: { currency: "USD", revenue: "120.50" },
              },
            },
          ],
          nextCursor: "official-cursor-2",
        },
      ],
    });
    const store = new InMemoryFinanceRecordStore();

    const result = await runFinanceIngestion(source, store, {
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    expect(result).toEqual({
      status: "ready",
      source: "official-filings",
      sourceMode: "real",
      attempts: 1,
      fetched: 1,
      created: 1,
      updated: 0,
      duplicates: 0,
      nextCursor: "official-cursor-2",
      records: [
        {
          sourceRecordId: "filing-2026-08-12-001",
          kind: "filing",
          sourceUrl: "https://example.gov/filings/001",
          publishedAt: "2026-08-11T16:00:00.000Z",
          fetchedAt: "2026-08-12T00:05:00.000Z",
          lastSeenAt: "2026-08-12T00:05:00.000Z",
          publisher: {
            name: "Example Government Filings",
            identifier: "example-government-filings",
            url: "https://example.gov/filings",
          },
          provenance: {
            ...verifiedDisplayPolicy,
            source: "official-filings",
            sourceMode: "real",
            entitlement: "public-filings",
            license: "official-open-data-v1",
            delaySeconds: 300,
            capabilities: ["filing"],
            licenseUrl: "https://example.gov/open-data-terms",
            licenseScope: "public-reuse",
            externalDisplayAllowed: true,
            bodyStorageAllowed: false,
            attribution: "Example Government Filings",
            licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
          },
          contentHash:
            "sha256:6b0f1e15fadf3618d54aeb5846966fe166e7b79f74a6f959969a0adda792f25b",
          content: {
            title: "芯片公司发布财报",
            language: "zh-CN",
            symbols: ["US.TEST"],
            topics: ["earnings", "semiconductors"],
            attributes: { currency: "USD", revenue: "120.50" },
          },
        },
      ],
    });
    expect(store.records()).toEqual(result.records);
  });

  it("deduplicates identical source content and replaces a corrected revision", async () => {
    const baseRecord = {
      sourceRecordId: "news-42",
      kind: "news" as const,
      sourceUrl: "https://example.gov/news/42",
      publishedAt: "2026-08-12T00:00:00.000Z",
      publisher: { name: "Example Government News" },
      content: {
        title: "官方数据发布",
        language: "zh-CN",
        symbols: ["SH.TEST"],
        topics: ["macro-release"],
        attributes: { country: "CN", region: "mainland" },
      },
    };
    const source = new TestFinanceSourceAdapter({
      descriptor: {
        ...verifiedDisplayPolicy,
        source: "official-news",
        sourceMode: "real",
        entitlement: "public-news",
        license: null,
        delaySeconds: 120,
        capabilities: ["news"],
        licenseUrl: "https://example.gov/news-terms",
        licenseScope: "metadata-linkout-only",
        externalDisplayAllowed: true,
        bodyStorageAllowed: false,
        attribution: "Example Government News",
        licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
      },
      batches: [
        { records: [baseRecord] },
        {
          records: [
            {
              ...baseRecord,
              content: {
                ...baseRecord.content,
                attributes: { region: "mainland", country: "CN" },
              },
            },
          ],
        },
        {
          records: [
            {
              ...baseRecord,
              content: {
                ...baseRecord.content,
                title: "经来源方更正后的标题",
              },
            },
          ],
        },
        {
          records: [
            {
              ...baseRecord,
              sourceUrl: "https://example.gov/news/42-corrected",
              publishedAt: "2026-08-12T00:01:00.000Z",
            },
          ],
        },
      ],
    });
    const store = new InMemoryFinanceRecordStore();

    const first = await runFinanceIngestion(source, store, {
      clock: () => "2026-08-12T00:02:00.000Z",
    });
    const duplicate = await runFinanceIngestion(source, store, {
      clock: () => "2026-08-12T00:04:00.000Z",
    });
    expect(duplicate.records).toEqual(store.records());
    expect(store.records()[0]).toMatchObject({
      fetchedAt: "2026-08-12T00:04:00.000Z",
      lastSeenAt: "2026-08-12T00:04:00.000Z",
    });
    const correction = await runFinanceIngestion(source, store, {
      clock: () => "2026-08-12T00:06:00.000Z",
    });
    const provenanceCorrection = await runFinanceIngestion(source, store, {
      clock: () => "2026-08-12T00:08:00.000Z",
    });

    expect(first).toMatchObject({ created: 1, updated: 0, duplicates: 0 });
    expect(duplicate).toMatchObject({
      created: 0,
      updated: 0,
      duplicates: 1,
    });
    expect(duplicate.records[0]?.contentHash).toBe(
      first.records[0]?.contentHash,
    );
    expect(correction).toMatchObject({
      created: 0,
      updated: 1,
      duplicates: 0,
    });
    expect(correction.records[0]?.contentHash).not.toBe(
      first.records[0]?.contentHash,
    );
    expect(provenanceCorrection).toMatchObject({
      created: 0,
      updated: 1,
      duplicates: 0,
    });
    expect(provenanceCorrection.records[0]?.contentHash).not.toBe(
      first.records[0]?.contentHash,
    );
    expect(store.records()).toHaveLength(1);
    expect(store.records()[0]).toMatchObject({
      sourceUrl: "https://example.gov/news/42-corrected",
      publishedAt: "2026-08-12T00:01:00.000Z",
      fetchedAt: "2026-08-12T00:08:00.000Z",
      lastSeenAt: "2026-08-12T00:08:00.000Z",
      content: { title: "官方数据发布" },
    });
  });

  it("replaces a record when its verified policy snapshot changes", async () => {
    const store = new InMemoryFinanceRecordStore();
    const record = {
      sourceRecordId: "macro-policy-snapshot",
      kind: "macro" as const,
      sourceUrl: "https://example.gov/macro/releases/1",
      publishedAt: "2026-08-12T00:00:00.000Z",
      publisher: { name: "Example Government Macro" },
      content: {
        title: "Official macro release",
        language: "en",
        symbols: [],
        topics: ["macro-release"],
        attributes: {},
      },
    };
    const descriptor = {
      ...verifiedDisplayPolicy,
      source: "official-macro-policy",
      sourceMode: "real" as const,
      entitlement: "public-release-calendar",
      license: null,
      delaySeconds: 0,
      capabilities: ["macro" as const],
      licenseUrl: "https://example.gov/macro-terms",
      licenseScope: "open-attribution" as const,
      externalDisplayAllowed: true,
      bodyStorageAllowed: false,
      attribution: "Example Government Macro",
      licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
    };

    const first = await runFinanceIngestion(
      new TestFinanceSourceAdapter({
        descriptor,
        batches: [{ records: [record] }],
      }),
      store,
      { clock: () => "2026-08-12T00:01:00.000Z" },
    );
    const revised = await runFinanceIngestion(
      new TestFinanceSourceAdapter({
        descriptor: {
          ...descriptor,
          officialSource: false,
          authType: "api-key",
          market: "global",
          languages: ["en", "zh-CN"],
          historyStartAt: "1980-01-01T00:00:00.000Z",
          nativeCadenceSeconds: 600,
          minPollIntervalSeconds: 120,
          staleAfterSeconds: 1_800,
          imageStorageAllowed: true,
          redistributionAllowed: true,
          termsVerifiedAt: "2026-08-11T00:00:00.000Z",
          licenseSnapshotId: "license_snapshot_test_v2",
          documentedRateLimit: { status: "unknown" },
          configuredRateLimit: { requests: 4, perSeconds: 1 },
          robotsPolicy: "allowed",
          robotsCheckedAt: "2026-08-11T00:05:00.000Z",
          robotsUrl: "https://example.gov/robots.txt",
          rawRetentionDays: 14,
          transportKind: "gcs-path-style",
          transportBaseUrl:
            "https://storage.googleapis.com/data.example.gov/releases/",
        },
        batches: [{ records: [record] }],
      }),
      store,
      { clock: () => "2026-08-12T00:02:00.000Z" },
    );

    expect(first).toMatchObject({ created: 1, updated: 0 });
    expect(revised).toMatchObject({
      created: 0,
      updated: 1,
      records: [
        {
          provenance: {
            officialSource: false,
            authType: "api-key",
            market: "global",
            languages: ["en", "zh-CN"],
            historyStartAt: "1980-01-01T00:00:00.000Z",
            nativeCadenceSeconds: 600,
            minPollIntervalSeconds: 120,
            staleAfterSeconds: 1_800,
            imageStorageAllowed: true,
            redistributionAllowed: true,
            termsVerifiedAt: "2026-08-11T00:00:00.000Z",
            licenseSnapshotId: "license_snapshot_test_v2",
            documentedRateLimit: { status: "unknown" },
            configuredRateLimit: { requests: 4, perSeconds: 1 },
            robotsPolicy: "allowed",
            robotsCheckedAt: "2026-08-11T00:05:00.000Z",
            robotsUrl: "https://example.gov/robots.txt",
            rawRetentionDays: 14,
            transportKind: "gcs-path-style",
            transportBaseUrl:
              "https://storage.googleapis.com/data.example.gov/releases/",
          },
        },
      ],
    });
    expect(revised.records[0]?.contentHash).not.toBe(
      first.records[0]?.contentHash,
    );
    expect(store.records()).toEqual(revised.records);
  });

  it("retries transient source failures before persisting one atomic batch", async () => {
    let fetchAttempts = 0;
    const retryDelays: number[] = [];
    const retryErrors: unknown[] = [];
    const recommendedDelays: number[] = [];
    const store = new InMemoryFinanceRecordStore();

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "licensed-market-feed",
          sourceMode: "real",
          entitlement: "delayed-quotes",
          license: "commercial-evaluation",
          delaySeconds: 900,
          capabilities: ["quote"],
          licenseUrl: "https://data.example.com/terms",
          licenseScope: "external-display-contract",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Example Licensed Market Feed",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          fetchAttempts += 1;
          if (fetchAttempts < 3) {
            throw new FinanceSourceFetchError("temporary upstream timeout", {
              classification: "transient",
              retry: { kind: "backoff" },
            });
          }
          return Promise.resolve({
            records: [
              {
                sourceRecordId: "quote-US.TEST-20260812T000000Z",
                kind: "quote",
                sourceUrl: "https://data.example.com/quotes/US.TEST",
                publishedAt: "2026-08-12T00:00:00.000Z",
                publisher: { name: "Example Licensed Market Feed" },
                content: {
                  title: "US.TEST delayed quote",
                  language: "und",
                  symbols: ["US.TEST"],
                  topics: ["market-quote"],
                  attributes: { price: "120.50", currency: "USD" },
                },
              },
            ],
          });
        },
      },
      store,
      {
        clock: () => "2026-08-12T00:15:00.000Z",
        maxAttempts: 3,
        retryDelay: (failedAttempt, error, recommendedDelayMilliseconds) => {
          retryDelays.push(failedAttempt);
          retryErrors.push(error);
          recommendedDelays.push(recommendedDelayMilliseconds);
          return Promise.resolve();
        },
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      attempts: 3,
      fetched: 1,
      created: 1,
    });
    expect(fetchAttempts).toBe(3);
    expect(retryDelays).toEqual([1, 2]);
    expect(recommendedDelays).toEqual([1_000, 2_000]);
    expect(retryErrors).toEqual([
      expect.objectContaining({ message: "temporary upstream timeout" }),
      expect.objectContaining({ message: "temporary upstream timeout" }),
    ]);
    expect(store.records()).toHaveLength(1);
  });

  it("honors a typed source instruction to stop an unsafe retry locally", async () => {
    const upstreamError = new FinanceSourceFetchError(
      "rate limited until upstream reset",
      {
        classification: "rate-limited",
        retry: { kind: "never" },
      },
    );
    let fetchAttempts = 0;
    let delayCalls = 0;

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "policy-aware-source",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["filing"],
          licenseUrl: "https://example.gov/policy-aware-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Policy Aware Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          fetchAttempts += 1;
          throw upstreamError;
        },
      },
      new InMemoryFinanceRecordStore(),
      {
        maxAttempts: 3,
        retryDelay: () => {
          delayCalls += 1;
          return Promise.resolve();
        },
      },
    );

    expect(result).toMatchObject({
      status: "degraded",
      attempts: 1,
      failure: { stage: "fetch", code: "SOURCE_UNAVAILABLE" },
    });
    expect(fetchAttempts).toBe(1);
    expect(delayCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("rate limited");
  });

  it("uses an adapter-owned long retry delay for rate limits", async () => {
    let fetchAttempts = 0;
    const recommendedDelays: number[] = [];

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "rate-limited-source",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Rate Limited Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          fetchAttempts += 1;
          if (fetchAttempts === 1) {
            throw new FinanceSourceFetchError("429 upstream reset", {
              classification: "rate-limited",
              retry: { kind: "after", delayMilliseconds: 60_000 },
            });
          }
          return Promise.resolve({ records: [] });
        },
      },
      new InMemoryFinanceRecordStore(),
      {
        maxAttempts: 2,
        retryDelay: (_attempt, _error, recommendedDelayMilliseconds) => {
          recommendedDelays.push(recommendedDelayMilliseconds);
          return Promise.resolve();
        },
      },
    );

    expect(result).toMatchObject({ status: "ready", attempts: 2 });
    expect(recommendedDelays).toEqual([60_000]);
  });

  it("does not retry an untyped access failure even when more attempts are allowed", async () => {
    let fetchAttempts = 0;

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "untyped-access-failure",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Untyped Access Failure",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          fetchAttempts += 1;
          throw new Error("403 provider detail must not leak");
        },
      },
      new InMemoryFinanceRecordStore(),
      { maxAttempts: 3, retryDelay: () => Promise.resolve() },
    );

    expect(result).toMatchObject({
      status: "degraded",
      attempts: 1,
      failure: { stage: "fetch", code: "SOURCE_UNAVAILABLE" },
    });
    expect(fetchAttempts).toBe(1);
    expect(JSON.stringify(result)).not.toContain("403");
  });

  it("degrades safely after retry exhaustion without exposing upstream details", async () => {
    let attempts = 0;
    const store = new InMemoryFinanceRecordStore();

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "official-macro",
          sourceMode: "real",
          entitlement: "public-release-calendar",
          license: null,
          delaySeconds: 0,
          capabilities: ["macro"],
          licenseUrl: "https://example.gov/macro-terms",
          licenseScope: "open-attribution",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Example Government Macro",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          attempts += 1;
          throw new FinanceSourceFetchError(
            "upstream secret token=do-not-leak",
            {
              classification: "transient",
              retry: { kind: "backoff" },
            },
          );
        },
      },
      store,
      {
        maxAttempts: 2,
        retryDelay: () => Promise.resolve(),
      },
    );

    expect(result).toEqual({
      status: "degraded",
      source: "official-macro",
      sourceMode: "real",
      attempts: 2,
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
    });
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
    expect(attempts).toBe(2);
    expect(store.records()).toEqual([]);
  });

  it("degrades invalid source batches and atomic persistence failures at their stage", async () => {
    const descriptor = {
      ...verifiedDisplayPolicy,
      source: "official-filings",
      sourceMode: "real" as const,
      entitlement: "public-filings",
      license: null,
      delaySeconds: 0,
      capabilities: ["filing" as const],
      licenseUrl: "https://example.gov/filing-terms",
      licenseScope: "public-reuse" as const,
      externalDisplayAllowed: true,
      bodyStorageAllowed: false,
      attribution: "Example Government Filings",
      licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
    };
    const invalidSource = new TestFinanceSourceAdapter({
      descriptor,
      batches: [
        {
          records: [
            {
              sourceRecordId: "invalid-filing",
              kind: "filing",
              sourceUrl: "file:///private/source",
              publishedAt: "2026-08-12T00:00:00.000Z",
              publisher: { name: "Example Government Filings" },
              content: {
                title: "Invalid source URL",
                language: "en",
                symbols: [],
                topics: ["filing"],
                attributes: {},
              },
            },
          ],
        },
      ],
    });

    const invalidResult = await runFinanceIngestion(
      invalidSource,
      new InMemoryFinanceRecordStore(),
      { clock: () => "2026-08-12T00:01:00.000Z" },
    );

    expect(invalidResult).toMatchObject({
      status: "degraded",
      attempts: 1,
      fetched: 1,
      records: [],
      failure: {
        stage: "normalize",
        code: "INVALID_SOURCE_RECORD",
        message: "Finance source returned an invalid record batch",
      },
    });

    const validSource = new TestFinanceSourceAdapter({
      descriptor,
      batches: [
        {
          records: [
            {
              sourceRecordId: "valid-filing",
              kind: "filing",
              sourceUrl: "https://example.gov/filings/valid",
              publishedAt: "2026-08-12T00:00:00.000Z",
              publisher: { name: "Example Government Filings" },
              content: {
                title: "Valid filing metadata",
                language: "en",
                symbols: [],
                topics: ["filing"],
                attributes: {},
              },
            },
          ],
        },
      ],
    });
    const persistenceResult = await runFinanceIngestion(
      validSource,
      {
        persist: () => {
          throw new Error("database password=do-not-leak");
        },
      },
      { clock: () => "2026-08-12T00:01:00.000Z" },
    );

    expect(persistenceResult).toMatchObject({
      status: "degraded",
      attempts: 1,
      fetched: 1,
      records: [],
      failure: {
        stage: "persist",
        code: "STORE_UNAVAILABLE",
        message: "Finance records could not be persisted",
      },
    });
    expect(JSON.stringify(persistenceResult)).not.toContain("do-not-leak");
  });

  it.each(["unknown-blocked", "internal-nondisplay"] as const)(
    "fails closed before fetching when real display scope is %s",
    async (licenseScope) => {
      let fetchCalled = false;

      await expect(
        runFinanceIngestion(
          {
            descriptor: {
              ...verifiedDisplayPolicy,
              source: "unverified-source",
              sourceMode: "real",
              entitlement: "unverified",
              license: null,
              delaySeconds: 0,
              capabilities: ["news"],
              licenseUrl: "https://example.com/terms",
              licenseScope,
              externalDisplayAllowed: true,
              bodyStorageAllowed: false,
              attribution: "Unverified Source",
              licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
            },
            fetch: () => {
              fetchCalled = true;
              return Promise.resolve({ records: [] });
            },
          },
          new InMemoryFinanceRecordStore(),
        ),
      ).rejects.toThrow("display rights");
      expect(fetchCalled).toBe(false);
    },
  );

  it("degrades when a store reports non-atomic persistence counts", async () => {
    const source = new TestFinanceSourceAdapter({
      descriptor: {
        ...verifiedDisplayPolicy,
        source: "official-empty-feed",
        sourceMode: "real",
        entitlement: "public-metadata",
        license: null,
        delaySeconds: 0,
        capabilities: ["news"],
        licenseUrl: "https://example.gov/empty-feed-terms",
        licenseScope: "public-reuse",
        externalDisplayAllowed: true,
        bodyStorageAllowed: false,
        attribution: "Example Government Empty Feed",
        licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
      },
      batches: [{ records: [] }],
    });

    const result = await runFinanceIngestion(source, {
      persist: () =>
        Promise.resolve({
          created: 1,
          updated: 0,
          duplicates: 0,
          records: [],
        }),
    });

    expect(result).toMatchObject({
      status: "degraded",
      fetched: 0,
      failure: {
        stage: "persist",
        code: "STORE_UNAVAILABLE",
      },
    });
  });

  it("degrades when a store claims success but returns a stale duplicate", async () => {
    const source = new TestFinanceSourceAdapter({
      descriptor: {
        ...verifiedDisplayPolicy,
        source: "stale-store-source",
        sourceMode: "real",
        entitlement: "public-metadata",
        license: null,
        delaySeconds: 0,
        capabilities: ["news"],
        licenseUrl: "https://example.gov/source-terms",
        licenseScope: "public-reuse",
        externalDisplayAllowed: true,
        bodyStorageAllowed: false,
        attribution: "Stale Store Source",
        licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
      },
      batches: [
        {
          records: [
            {
              sourceRecordId: "stale-1",
              kind: "news",
              sourceUrl: "https://example.gov/news/stale-1",
              publishedAt: "2026-08-12T00:00:00.000Z",
              publisher: { name: "Stale Store Source" },
              content: {
                title: "Current source record",
                language: "en",
                symbols: [],
                topics: ["markets"],
                attributes: {},
              },
            },
          ],
        },
      ],
    });

    const result = await runFinanceIngestion(
      source,
      {
        persist: (records) =>
          Promise.resolve({
            created: 0,
            updated: 0,
            duplicates: 1,
            records: records.map((record) => ({
              ...record,
              fetchedAt: "2026-08-12T00:00:00.000Z",
              lastSeenAt: "2026-08-12T00:00:00.000Z",
            })),
          }),
      },
      { clock: () => "2026-08-12T00:05:00.000Z" },
    );

    expect(result).toMatchObject({
      status: "degraded",
      fetched: 1,
      failure: { stage: "persist", code: "STORE_UNAVAILABLE" },
    });
  });

  it.each([
    [
      "configured rate above documented rate",
      { configuredRateLimit: { requests: 11, perSeconds: 1 } },
    ],
    [
      "robots check missing",
      { robotsPolicy: "allowed", robotsCheckedAt: null, robotsUrl: null },
    ],
    [
      "robots access blocked",
      {
        robotsPolicy: "unknown-blocked",
        robotsCheckedAt: "2026-08-11T00:00:00.000Z",
        robotsUrl: "https://example.gov/robots.txt",
      },
    ],
  ] as const)(
    "fails closed before fetching for invalid provenance: %s",
    async (_label, provenanceOverride) => {
      let fetchCalled = false;

      await expect(
        runFinanceIngestion(
          {
            descriptor: {
              ...verifiedDisplayPolicy,
              ...provenanceOverride,
              source: "invalid-provenance-source",
              sourceMode: "real",
              entitlement: "public-metadata",
              license: null,
              delaySeconds: 0,
              capabilities: ["news"],
              licenseUrl: "https://example.gov/source-terms",
              licenseScope: "public-reuse",
              externalDisplayAllowed: true,
              bodyStorageAllowed: false,
              attribution: "Invalid Provenance Source",
              licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
            } as never,
            fetch: () => {
              fetchCalled = true;
              return Promise.resolve({ records: [] });
            },
          },
          new InMemoryFinanceRecordStore(),
        ),
      ).rejects.toThrow();
      expect(fetchCalled).toBe(false);
    },
  );

  it("fails closed before fetching when a scope claims rights outside its matrix", async () => {
    let fetchCalled = false;
    const store = new InMemoryFinanceRecordStore();

    await expect(
      runFinanceIngestion(
        {
          descriptor: {
            ...verifiedDisplayPolicy,
            source: "inconsistent-metadata-linkout",
            sourceMode: "real",
            entitlement: "public-metadata",
            license: null,
            delaySeconds: 0,
            capabilities: ["news"],
            licenseUrl: "https://example.org/metadata-terms",
            licenseScope: "metadata-linkout-only",
            externalDisplayAllowed: true,
            bodyStorageAllowed: true,
            imageStorageAllowed: true,
            redistributionAllowed: true,
            transformationAllowed: true,
            attributionRequired: false,
            attribution: "Metadata Linkout Source",
            licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
          },
          fetch: () => {
            fetchCalled = true;
            return Promise.resolve({
              records: [
                {
                  sourceRecordId: "rights-probe",
                  kind: "news",
                  sourceUrl: "https://example.org/articles/rights-probe",
                  publishedAt: "2026-08-12T00:00:00.000Z",
                  publisher: { name: "Example Publisher" },
                  content: {
                    title: "Linkout title",
                    summary: "Body-derived summary",
                    language: "en",
                    symbols: [],
                    topics: ["markets"],
                    attributes: {
                      heroImageUrl: "https://example.org/hero.jpg",
                    },
                  },
                },
              ],
            } as unknown as FinanceSourceBatch);
          },
        },
        store,
      ),
    ).rejects.toThrow("license scope");
    expect(fetchCalled).toBe(false);
    expect(store.records()).toEqual([]);
  });

  it.each([
    ["top-level summary", { summary: "body-derived summary" }, {}],
    ["top-level excerpt", { excerpt: "body-derived excerpt" }, {}],
    ["camel-case body HTML", {}, { bodyHtml: "<p>secret</p>" }],
    ["case and punctuation alias", {}, { "BODY.HTML": "<p>secret</p>" }],
    ["hero image URL", {}, { heroImageUrl: "https://example.org/a.jpg" }],
    ["social image array", {}, { socialImage: ["https://example.org/a.jpg"] }],
    ["mixed-case image alias", {}, { IMAGE_url: "https://example.org/a.jpg" }],
    ["nested summary", {}, { metadata: { summary: "secret" } }],
    ["nested array body", {}, { metadata: [{ ArticleText: "secret" }] }],
    ["unknown oversized field", {}, { custom: "x".repeat(50_000) }],
  ] as const)(
    "rejects non-P0 content hidden as %s even when the source has broad storage rights",
    async (_label, contentExtension, attributes) => {
      const store = new InMemoryFinanceRecordStore();
      const source = {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "broad-rights-source",
          sourceMode: "real" as const,
          entitlement: "public-data",
          license: "public-reuse-v1",
          delaySeconds: 0,
          capabilities: ["news" as const],
          licenseUrl: "https://example.org/public-reuse-terms",
          licenseScope: "public-reuse" as const,
          externalDisplayAllowed: true,
          bodyStorageAllowed: true,
          imageStorageAllowed: true,
          redistributionAllowed: true,
          transformationAllowed: true,
          attributionRequired: false,
          attribution: "Broad Rights Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () =>
          Promise.resolve({
            records: [
              {
                sourceRecordId: "malicious-alias-probe",
                kind: "news",
                sourceUrl: "https://example.org/articles/alias-probe",
                publishedAt: "2026-08-12T00:00:00.000Z",
                publisher: { name: "Example Publisher" },
                content: {
                  title: "Permitted metadata title",
                  language: "en",
                  symbols: [],
                  topics: ["markets"],
                  attributes,
                  ...contentExtension,
                },
              },
            ],
          } as unknown as FinanceSourceBatch),
      };

      const result = await runFinanceIngestion(source, store);

      expect(result).toMatchObject({
        status: "degraded",
        fetched: 1,
        records: [],
        failure: { stage: "normalize", code: "INVALID_SOURCE_RECORD" },
      });
      expect(store.records()).toEqual([]);
    },
  );

  it("records an HTTPS GCS path-style transport without weakening metadata-linkout rights", async () => {
    const result = await runFinanceIngestion(
      new TestFinanceSourceAdapter({
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "global-news-metadata",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 900,
          capabilities: ["news"],
          licenseUrl: "https://example.org/metadata-terms",
          licenseScope: "metadata-linkout-only",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          imageStorageAllowed: false,
          redistributionAllowed: false,
          transformationAllowed: false,
          attributionRequired: true,
          attribution: "Global News Metadata",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
          officialSource: false,
          market: "global",
          transportKind: "gcs-path-style",
          transportBaseUrl:
            "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/",
          transportSecurity: "https",
          tlsVerification: "required",
          redirectPolicy: "error",
        },
        batches: [
          {
            records: [
              {
                sourceRecordId: "global-news-1",
                kind: "news",
                sourceUrl: "https://publisher.example.com/article/1",
                publishedAt: "2026-08-12T00:00:00.000Z",
                publisher: { name: "Example Publisher" },
                content: {
                  title: "Publisher supplied headline",
                  language: "en",
                  symbols: [],
                  topics: ["markets"],
                  attributes: { sourceCountry: "US" },
                },
              },
            ],
          },
        ],
      }),
      new InMemoryFinanceRecordStore(),
      { clock: () => "2026-08-12T00:15:00.000Z" },
    );

    expect(result).toMatchObject({
      status: "ready",
      records: [
        {
          provenance: {
            officialSource: false,
            licenseScope: "metadata-linkout-only",
            bodyStorageAllowed: false,
            imageStorageAllowed: false,
            redistributionAllowed: false,
            transformationAllowed: false,
            attributionRequired: true,
            transportKind: "gcs-path-style",
            transportBaseUrl:
              "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/",
            transportSecurity: "https",
            tlsVerification: "required",
            redirectPolicy: "error",
          },
        },
      ],
    });
  });

  it.each([
    ["HTTP fallback", { transportBaseUrl: "http://storage.example.com/data/" }],
    [
      "IPv4 loopback transport",
      { transportBaseUrl: "https://127.0.0.1/data/" },
    ],
    ["IPv6 loopback transport", { transportBaseUrl: "https://[::1]/data/" }],
    ["localhost transport", { transportBaseUrl: "https://localhost/data/" }],
    ["single-label transport", { transportBaseUrl: "https://intranet/data/" }],
    [
      "local-domain transport",
      { transportBaseUrl: "https://source.local/data/" },
    ],
    [
      "private address transport",
      { transportBaseUrl: "https://192.168.1.20/data/" },
    ],
    [
      "non-standard HTTPS port",
      { transportBaseUrl: "https://example.org:8443/data/" },
    ],
    ["TLS disabled", { tlsVerification: "disabled" }],
    ["redirect following", { redirectPolicy: "follow" }],
    ["plaintext transport", { transportSecurity: "plaintext-checksum-only" }],
    [
      "GCS path-style on an untrusted host",
      {
        transportKind: "gcs-path-style",
        transportBaseUrl: "https://storage.attacker.example/data/",
      },
    ],
  ] as const)(
    "rejects unsafe public transport policy: %s",
    async (_label, transportOverride) => {
      let fetchCalled = false;

      await expect(
        runFinanceIngestion(
          {
            descriptor: {
              ...verifiedDisplayPolicy,
              ...transportOverride,
              source: "unsafe-transport-source",
              sourceMode: "real",
              entitlement: "public-metadata",
              license: null,
              delaySeconds: 0,
              capabilities: ["news"],
              licenseUrl: "https://example.org/source-terms",
              licenseScope: "public-reuse",
              externalDisplayAllowed: true,
              bodyStorageAllowed: false,
              attribution: "Unsafe Transport Source",
              licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
            } as never,
            fetch: () => {
              fetchCalled = true;
              return Promise.resolve({ records: [] });
            },
          },
          new InMemoryFinanceRecordStore(),
        ),
      ).rejects.toThrow();
      expect(fetchCalled).toBe(false);
    },
  );

  it.each([
    "https://127.0.0.1/article",
    "https://[::1]/article",
    "https://10.0.0.1/article",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/article",
    "https://intranet/article",
    "https://publisher.local/article",
    "https://example.org:8443/article",
    "https://user:password@example.org/article",
    "https://example.org/article#private-fragment",
  ])(
    "degrades a non-public source URL without persisting it: %s",
    async (sourceUrl) => {
      const store = new InMemoryFinanceRecordStore();
      const result = await runFinanceIngestion(
        {
          descriptor: {
            ...verifiedDisplayPolicy,
            source: "hostile-link-source",
            sourceMode: "real",
            entitlement: "public-metadata",
            license: null,
            delaySeconds: 0,
            capabilities: ["news"],
            licenseUrl: "https://example.org/source-terms",
            licenseScope: "public-reuse",
            externalDisplayAllowed: true,
            bodyStorageAllowed: false,
            attribution: "Hostile Link Source",
            licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
          },
          fetch: () =>
            Promise.resolve({
              records: [
                {
                  sourceRecordId: "hostile-link-1",
                  kind: "news",
                  sourceUrl,
                  publishedAt: "2026-08-12T00:00:00.000Z",
                  publisher: { name: "Hostile Link Publisher" },
                  content: {
                    title: "Untrusted link",
                    language: "en",
                    symbols: [],
                    topics: ["markets"],
                    attributes: {},
                  },
                },
              ],
            }),
        },
        store,
      );

      expect(result).toMatchObject({
        status: "degraded",
        fetched: 1,
        records: [],
        failure: { stage: "normalize", code: "INVALID_SOURCE_RECORD" },
      });
      expect(store.records()).toEqual([]);
    },
  );

  it("degrades a null source batch without throwing or dereferencing it", async () => {
    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "malformed-source",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Malformed Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => Promise.resolve(null as unknown as FinanceSourceBatch),
      },
      new InMemoryFinanceRecordStore(),
    );

    expect(result).toEqual({
      status: "degraded",
      source: "malformed-source",
      sourceMode: "real",
      attempts: 1,
      fetched: 0,
      created: 0,
      updated: 0,
      duplicates: 0,
      records: [],
      failure: {
        stage: "normalize",
        code: "INVALID_SOURCE_RECORD",
        message: "Finance source returned an invalid record batch",
      },
    });
  });

  it("degrades an unsafe next cursor without exposing it to callers", async () => {
    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "unsafe-next-cursor-source",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Unsafe Next Cursor Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () =>
          Promise.resolve({ records: [], nextCursor: '{"unsafe":true}' }),
      },
      new InMemoryFinanceRecordStore(),
    );

    expect(result).toMatchObject({
      status: "degraded",
      fetched: 0,
      failure: { stage: "normalize", code: "INVALID_SOURCE_RECORD" },
    });
    expect(JSON.stringify(result)).not.toContain('{"unsafe":true}');
  });

  it.each([
    "",
    "has space",
    "line\nbreak",
    '{"provider":"cursor"}',
    "x".repeat(2_049),
    123 as unknown as string,
    null as unknown as string,
  ])(
    "rejects an unsafe input cursor before the adapter sees %j",
    async (cursor) => {
      let fetchCalled = false;

      await expect(
        runFinanceIngestion(
          {
            descriptor: {
              ...verifiedDisplayPolicy,
              source: "cursor-source",
              sourceMode: "real",
              entitlement: "public-metadata",
              license: null,
              delaySeconds: 0,
              capabilities: ["news"],
              licenseUrl: "https://example.org/source-terms",
              licenseScope: "public-reuse",
              externalDisplayAllowed: true,
              bodyStorageAllowed: false,
              attribution: "Cursor Source",
              licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
            },
            fetch: () => {
              fetchCalled = true;
              return Promise.resolve({ records: [] });
            },
          },
          new InMemoryFinanceRecordStore(),
          { cursor },
        ),
      ).rejects.toThrow("cursor");
      expect(fetchCalled).toBe(false);
    },
  );

  it("passes a validated opaque cursor to the adapter unchanged", async () => {
    let observedCursor: string | undefined;

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "cursor-source",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Cursor Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: ({ cursor }) => {
          observedCursor = cursor;
          return Promise.resolve({ records: [] });
        },
      },
      new InMemoryFinanceRecordStore(),
      { cursor: "cursor_v1:abc-123==" },
    );

    expect(result).toMatchObject({ status: "ready", attempts: 1 });
    expect(observedCursor).toBe("cursor_v1:abc-123==");
  });

  it("defaults to one attempt even when a source marks an error retryable", async () => {
    let fetchAttempts = 0;
    let delayCalls = 0;

    const result = await runFinanceIngestion(
      {
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "single-attempt-default",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/source-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Single Attempt Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        fetch: () => {
          fetchAttempts += 1;
          throw new FinanceSourceFetchError("temporary failure", {
            classification: "transient",
            retry: { kind: "backoff" },
          });
        },
      },
      new InMemoryFinanceRecordStore(),
      {
        retryDelay: () => {
          delayCalls += 1;
          return Promise.resolve();
        },
      },
    );

    expect(result).toMatchObject({
      status: "degraded",
      attempts: 1,
      failure: { stage: "fetch", code: "SOURCE_UNAVAILABLE" },
    });
    expect(fetchAttempts).toBe(1);
    expect(delayCalls).toBe(0);
  });
});
