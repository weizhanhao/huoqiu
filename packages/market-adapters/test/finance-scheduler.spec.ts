import { describe, expect, it, vi } from "vitest";

import {
  financeSourceDescriptorSchema,
  type FinanceSourceDescriptor,
  type FinanceSourceRecord,
} from "@huoqiu/contracts/finance/ingestion-v1";
import type { PublicFinanceSnapshot } from "@huoqiu/contracts/finance/public-snapshot-v1";

import {
  FinanceIngestionCoordinator,
  type FinanceCursorStore,
  type FinanceIngestionJob,
  type PublicFinanceSnapshotRepository,
} from "../src/finance/scheduler.js";
import type {
  FinanceRecordStore,
  FinanceSourceAdapter,
} from "../src/ingestion.js";
import { InMemoryFinanceRecordStore } from "../src/testing/in-memory-finance-ingestion.js";

const descriptorFor = (source: string): FinanceSourceDescriptor =>
  financeSourceDescriptorSchema.parse({
    source,
    sourceMode: "real",
    entitlement: "public-metadata",
    license: "public-metadata-v1",
    delaySeconds: 0,
    capabilities: ["filing"],
    licenseUrl: "https://example.gov/open-data-terms",
    licenseScope: "public-reuse",
    externalDisplayAllowed: true,
    bodyStorageAllowed: false,
    imageStorageAllowed: false,
    redistributionAllowed: false,
    transformationAllowed: false,
    attributionRequired: true,
    attribution: "Example Government",
    licenseVerifiedAt: "2026-08-12T00:00:00.000Z",
    termsVerifiedAt: "2026-08-12T00:00:00.000Z",
    licenseSnapshotId: `${source}-policy-2026-08-12`,
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
    transportBaseUrl: "https://example.gov/",
    tlsVerification: "required",
    redirectPolicy: "error",
    rawRetentionDays: 0,
  });

const sourceRecordFor = (
  source: string,
  suffix = "001",
): FinanceSourceRecord => ({
  sourceRecordId: `${source}-${suffix}`,
  kind: "filing",
  sourceUrl: `https://example.gov/filings/${source}-${suffix}`,
  publishedAt: "2026-08-12T00:00:00.000Z",
  publisher: { name: "Example Government" },
  content: {
    title: `${source} filing ${suffix}`,
    language: "en",
    symbols: ["US.TEST"],
    topics: ["filing"],
    attributes: { formType: "8-K" },
  },
});

class MemoryCursorStore implements FinanceCursorStore {
  readonly values = new Map<string, string>();
  readonly commits: (readonly [string, string | undefined])[] = [];
  failRead = false;
  failWrite = false;

  async read(source: string): Promise<string | undefined> {
    if (this.failRead) throw new Error("cursor read failed");
    return this.values.get(source);
  }

  async commit(source: string, cursor: string | undefined): Promise<void> {
    if (this.failWrite) throw new Error("cursor write failed");
    this.commits.push([source, cursor]);
    if (cursor === undefined) this.values.delete(source);
    else this.values.set(source, cursor);
  }
}

class MemorySnapshotRepository implements PublicFinanceSnapshotRepository {
  current: PublicFinanceSnapshot | null = null;
  publishCalls = 0;
  activePublishes = 0;
  maximumConcurrentPublishes = 0;
  failPublish = false;

  async readLatestValid(): Promise<PublicFinanceSnapshot | null> {
    return this.current === null ? null : structuredClone(this.current);
  }

  async publish(snapshot: PublicFinanceSnapshot): Promise<void> {
    this.publishCalls += 1;
    this.activePublishes += 1;
    this.maximumConcurrentPublishes = Math.max(
      this.maximumConcurrentPublishes,
      this.activePublishes,
    );
    await Promise.resolve();
    try {
      if (this.failPublish) throw new Error("snapshot publish failed");
      this.current = structuredClone(snapshot);
    } finally {
      this.activePublishes -= 1;
    }
  }
}

const createSource = (input: {
  source: string;
  nextCursor?: string;
  records?: readonly FinanceSourceRecord[];
  fetch?: FinanceSourceAdapter["fetch"];
}): FinanceSourceAdapter => ({
  descriptor: descriptorFor(input.source),
  fetch:
    input.fetch ??
    vi.fn(async () => ({
      records: input.records ?? [sourceRecordFor(input.source)],
      ...(input.nextCursor === undefined
        ? {}
        : { nextCursor: input.nextCursor }),
    })),
});

const createJob = (
  source: FinanceSourceAdapter,
  store: FinanceRecordStore = new InMemoryFinanceRecordStore(),
): FinanceIngestionJob => ({ source, recordStore: store });

describe("finance ingestion coordinator", () => {
  it("serializes concurrent snapshot publications without losing either source", async () => {
    const cursorStore = new MemoryCursorStore();
    const snapshotRepository = new MemorySnapshotRepository();
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    const results = await coordinator.runAll([
      createJob(createSource({ source: "source-a", nextCursor: "next-a" })),
      createJob(createSource({ source: "source-b", nextCursor: "next-b" })),
    ]);

    expect(results.map(({ status }) => status)).toEqual([
      "published",
      "published",
    ]);
    expect(snapshotRepository.maximumConcurrentPublishes).toBe(1);
    expect(
      snapshotRepository.current?.sources.map(
        ({ descriptor }) => descriptor.source,
      ),
    ).toEqual(["source-a", "source-b"]);
    expect(
      snapshotRepository.current?.records.map(
        ({ provenance }) => provenance.source,
      ),
    ).toEqual(["source-a", "source-b"]);
    expect(cursorStore.values).toEqual(
      new Map([
        ["source-a", "next-a"],
        ["source-b", "next-b"],
      ]),
    );
  });

  it("shares the publication lock across coordinators using one repository", async () => {
    const cursorStore = new MemoryCursorStore();
    const snapshotRepository = new MemorySnapshotRepository();
    const firstCoordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });
    const secondCoordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    await Promise.all([
      firstCoordinator.run(createJob(createSource({ source: "source-a" }))),
      secondCoordinator.run(createJob(createSource({ source: "source-b" }))),
    ]);

    expect(snapshotRepository.maximumConcurrentPublishes).toBe(1);
    expect(
      snapshotRepository.current?.sources.map(
        ({ descriptor }) => descriptor.source,
      ),
    ).toEqual(["source-a", "source-b"]);
  });

  it("coalesces concurrent runs for the same source into one external fetch", async () => {
    let releaseFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetch = vi.fn(async () => {
      await fetchStarted;
      return { records: [sourceRecordFor("source-a")] };
    });
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore: new MemoryCursorStore(),
      snapshotRepository: new MemorySnapshotRepository(),
      clock: () => "2026-08-12T00:05:00.000Z",
    });
    const job = createJob(createSource({ source: "source-a", fetch }));

    const first = coordinator.run(job);
    const second = coordinator.run(job);
    releaseFetch();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it("shares same-source coalescing across coordinators using the same stores", async () => {
    let releaseFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetch = vi.fn(async () => {
      await fetchStarted;
      return { records: [sourceRecordFor("source-a")] };
    });
    const cursorStore = new MemoryCursorStore();
    const snapshotRepository = new MemorySnapshotRepository();
    const firstCoordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });
    const secondCoordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });
    const job = createJob(createSource({ source: "source-a", fetch }));

    const first = firstCoordinator.run(job);
    const second = secondCoordinator.run(job);
    releaseFetch();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it("commits the next cursor only after a successful snapshot publication", async () => {
    const events: string[] = [];
    const cursorStore = new MemoryCursorStore();
    cursorStore.commit = vi.fn(async (source, cursor) => {
      events.push(`cursor:${source}:${cursor ?? "complete"}`);
      if (cursor === undefined) cursorStore.values.delete(source);
      else cursorStore.values.set(source, cursor);
    });
    const snapshotRepository = new MemorySnapshotRepository();
    snapshotRepository.publish = vi.fn(async (snapshot) => {
      events.push("snapshot");
      snapshotRepository.current = structuredClone(snapshot);
    });
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    await coordinator.run(
      createJob(createSource({ source: "source-a", nextCursor: "next-a" })),
    );

    expect(events).toEqual(["snapshot", "cursor:source-a:next-a"]);
  });

  it("never advances a cursor when publication fails", async () => {
    const cursorStore = new MemoryCursorStore();
    cursorStore.values.set("source-a", "current-a");
    const snapshotRepository = new MemorySnapshotRepository();
    snapshotRepository.failPublish = true;
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    await expect(
      coordinator.run(
        createJob(
          createSource({ source: "source-a", nextCursor: "unsafe-advance" }),
        ),
      ),
    ).rejects.toThrow("snapshot");
    expect(cursorStore.values.get("source-a")).toBe("current-a");
    expect(cursorStore.commits).toEqual([]);
  });

  it("publishes degraded source state while retaining the previous real records and cursor", async () => {
    const cursorStore = new MemoryCursorStore();
    const snapshotRepository = new MemorySnapshotRepository();
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore,
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });
    await coordinator.run(
      createJob(createSource({ source: "source-a", nextCursor: "next-a" })),
    );
    const previousRecords = structuredClone(
      snapshotRepository.current?.records,
    );
    const failing = createSource({
      source: "source-a",
      fetch: vi.fn(async () => {
        throw new Error("upstream is down");
      }),
    });

    const result = await coordinator.run(createJob(failing));

    expect(result.status).toBe("published");
    expect(result.ingestion.status).toBe("degraded");
    expect(snapshotRepository.current?.sources[0]).toMatchObject({
      lastRunStatus: "degraded",
      failureCode: "SOURCE_UNAVAILABLE",
    });
    expect(snapshotRepository.current?.records).toEqual(previousRecords);
    expect(cursorStore.values.get("source-a")).toBe("next-a");
    expect(cursorStore.commits).toHaveLength(1);
  });

  it("isolates one coordinator failure so another source still publishes", async () => {
    const cursorStore = new MemoryCursorStore();
    cursorStore.failRead = true;
    const snapshotRepository = new MemorySnapshotRepository();
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore: {
        read: async (source) => {
          if (source === "source-a") throw new Error("cursor unavailable");
          return undefined;
        },
        commit: cursorStore.commit.bind(cursorStore),
      },
      snapshotRepository,
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    const results = await coordinator.runAll([
      createJob(createSource({ source: "source-a" })),
      createJob(createSource({ source: "source-b" })),
    ]);

    expect(results).toEqual([
      {
        status: "failed",
        source: "source-a",
        failure: {
          code: "CURSOR_STORE_UNAVAILABLE",
          message: "Finance ingestion cursor could not be read or committed",
        },
      },
      expect.objectContaining({ status: "published", source: "source-b" }),
    ]);
    expect(snapshotRepository.current?.sources).toHaveLength(1);
    expect(snapshotRepository.current?.sources[0]?.descriptor.source).toBe(
      "source-b",
    );
  });

  it("rejects duplicate or non-public jobs before any source fetch", async () => {
    const fetch = vi.fn(async () => ({ records: [] }));
    const source = createSource({ source: "source-a", fetch });
    const coordinator = new FinanceIngestionCoordinator({
      cursorStore: new MemoryCursorStore(),
      snapshotRepository: new MemorySnapshotRepository(),
      clock: () => "2026-08-12T00:05:00.000Z",
    });

    await expect(
      coordinator.runAll([createJob(source), createJob(source)]),
    ).rejects.toThrow("same source");

    const synthetic = {
      ...source,
      descriptor: { ...source.descriptor, sourceMode: "synthetic" as const },
    };
    await expect(coordinator.run(createJob(synthetic))).rejects.toThrow(
      "verified real",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
