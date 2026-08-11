import { describe, expect, it } from "vitest";

import { runFinanceIngestion } from "../src/ingestion.js";
import {
  InMemoryFinanceRecordStore,
  TestFinanceSourceAdapter,
} from "../src/testing/in-memory-finance-ingestion.js";

const verifiedDisplayPolicy = {
  officialSource: true,
  nativeCadenceSeconds: 300,
  minPollIntervalSeconds: 60,
  staleAfterSeconds: 900,
  redistributionAllowed: false,
  transformationAllowed: false,
  attributionRequired: true,
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
          source: "official-filings",
          sourceMode: "real",
          sourceRecordId: "filing-2026-08-12-001",
          kind: "filing",
          sourceUrl: "https://example.gov/filings/001",
          publishedAt: "2026-08-11T16:00:00.000Z",
          fetchedAt: "2026-08-12T00:05:00.000Z",
          publisher: {
            name: "Example Government Filings",
            identifier: "example-government-filings",
            url: "https://example.gov/filings",
          },
          entitlement: "public-filings",
          license: "official-open-data-v1",
          delaySeconds: 300,
          sourceCapabilities: ["filing"],
          licenseUrl: "https://example.gov/open-data-terms",
          licenseScope: "public-reuse",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Example Government Filings",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
          officialSource: true,
          nativeCadenceSeconds: 300,
          minPollIntervalSeconds: 60,
          staleAfterSeconds: 900,
          redistributionAllowed: false,
          transformationAllowed: false,
          attributionRequired: true,
          termsVerifiedAt: "2026-08-10T00:00:00.000Z",
          rawRetentionDays: 7,
          licenseSnapshotId: "license_snapshot_test_v1",
          contentHash:
            "sha256:676b89af224dec42163a7ca820058668fe22c79097a0a44372d48ec11389e5ed",
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
        attributes: { region: "CN", language: "zh-CN" },
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
                attributes: { language: "zh-CN", region: "CN" },
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
          redistributionAllowed: true,
          termsVerifiedAt: "2026-08-11T00:00:00.000Z",
          licenseSnapshotId: "license_snapshot_test_v2",
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
          redistributionAllowed: true,
          termsVerifiedAt: "2026-08-11T00:00:00.000Z",
          licenseSnapshotId: "license_snapshot_test_v2",
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
            throw new Error("temporary upstream timeout");
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
        retryDelay: (failedAttempt, error) => {
          retryDelays.push(failedAttempt);
          retryErrors.push(error);
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
    expect(retryErrors).toEqual([
      expect.objectContaining({ message: "temporary upstream timeout" }),
      expect.objectContaining({ message: "temporary upstream timeout" }),
    ]);
    expect(store.records()).toHaveLength(1);
  });

  it("allows source policy to stop an unsafe retry immediately", async () => {
    const upstreamError = new Error("rate limited until upstream reset");
    let fetchAttempts = 0;
    const retryDecisions: Readonly<{ error: unknown; attempt: number }>[] = [];
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
        shouldRetry: (error, failedAttempt) => {
          retryDecisions.push({ error, attempt: failedAttempt });
          return false;
        },
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
    expect(retryDecisions).toEqual([{ error: upstreamError, attempt: 1 }]);
    expect(delayCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("rate limited");
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
          throw new Error("upstream secret token=do-not-leak");
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
      persist: () => Promise.resolve({ created: 1, updated: 0, duplicates: 0 }),
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

  it("rejects summaries and excerpts when the verified snapshot forbids body storage", async () => {
    const source = new TestFinanceSourceAdapter({
      descriptor: {
        ...verifiedDisplayPolicy,
        source: "metadata-linkout",
        sourceMode: "real",
        entitlement: "public-metadata",
        license: null,
        delaySeconds: 0,
        capabilities: ["news"],
        licenseUrl: "https://example.org/metadata-terms",
        licenseScope: "metadata-linkout-only",
        externalDisplayAllowed: true,
        bodyStorageAllowed: false,
        attribution: "Metadata Linkout Source",
        licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
      },
      batches: [
        {
          records: [
            {
              sourceRecordId: "metadata-1",
              kind: "news",
              sourceUrl: "https://example.org/articles/1",
              publishedAt: "2026-08-12T00:00:00.000Z",
              publisher: { name: "Example Publisher" },
              content: {
                title: "Linkout title",
                summary: "This body-derived summary must not be stored",
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
      new InMemoryFinanceRecordStore(),
    );

    expect(result).toMatchObject({
      status: "degraded",
      fetched: 1,
      records: [],
      failure: { stage: "normalize", code: "INVALID_SOURCE_RECORD" },
    });
  });

  it.each(["body", "articleText", "description", "html", "image", "thumbnail"])(
    "rejects hidden body or media attribute %s when body storage is forbidden",
    async (attributeKey) => {
      const source = new TestFinanceSourceAdapter({
        descriptor: {
          ...verifiedDisplayPolicy,
          source: "metadata-linkout-attributes",
          sourceMode: "real",
          entitlement: "public-metadata",
          license: null,
          delaySeconds: 0,
          capabilities: ["news"],
          licenseUrl: "https://example.org/metadata-terms",
          licenseScope: "metadata-linkout-only",
          externalDisplayAllowed: true,
          bodyStorageAllowed: false,
          attribution: "Metadata Linkout Source",
          licenseVerifiedAt: "2026-08-10T00:00:00.000Z",
        },
        batches: [
          {
            records: [
              {
                sourceRecordId: `hidden-${attributeKey}`,
                kind: "news",
                sourceUrl: `https://example.org/articles/${attributeKey}`,
                publishedAt: "2026-08-12T00:00:00.000Z",
                publisher: { name: "Example Publisher" },
                content: {
                  title: "Linkout title",
                  language: "en",
                  symbols: [],
                  topics: ["markets"],
                  attributes: { [attributeKey]: "hidden upstream content" },
                },
              },
            ],
          },
        ],
      });

      const result = await runFinanceIngestion(
        source,
        new InMemoryFinanceRecordStore(),
      );

      expect(result).toMatchObject({
        status: "degraded",
        fetched: 1,
        records: [],
        failure: { stage: "normalize", code: "INVALID_SOURCE_RECORD" },
      });
    },
  );
});
