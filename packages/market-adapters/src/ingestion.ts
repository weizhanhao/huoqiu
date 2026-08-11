import { createHash } from "node:crypto";

import {
  financeSourceDescriptorSchema,
  financeSourceRecordSchema,
  normalizedFinanceRecordSchema,
  type FinanceSourceDescriptor,
  type FinanceSourceRecord,
  type NormalizedFinanceRecord,
} from "@huoqiu/contracts/finance/ingestion-v1";

export type FinanceSourceBatch = Readonly<{
  records: readonly FinanceSourceRecord[];
  nextCursor?: string;
}>;

export interface FinanceSourceAdapter {
  readonly descriptor: FinanceSourceDescriptor;
  fetch(input: Readonly<{ cursor?: string }>): Promise<FinanceSourceBatch>;
}

export type FinanceRecordPersistResult = Readonly<{
  created: number;
  updated: number;
  duplicates: number;
}>;

export interface FinanceRecordStore {
  persist(
    records: readonly NormalizedFinanceRecord[],
  ): Promise<FinanceRecordPersistResult>;
}

export type FinanceIngestionReadyResult = Readonly<{
  status: "ready";
  source: string;
  sourceMode: "real" | "synthetic";
  attempts: number;
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  nextCursor?: string;
  records: readonly NormalizedFinanceRecord[];
}>;

export type FinanceIngestionDegradedResult = Readonly<{
  status: "degraded";
  source: string;
  sourceMode: "real" | "synthetic";
  attempts: number;
  fetched: number;
  created: 0;
  updated: 0;
  duplicates: 0;
  records: readonly [];
  failure:
    | Readonly<{
        stage: "fetch";
        code: "SOURCE_UNAVAILABLE";
        message: "Finance source is temporarily unavailable";
      }>
    | Readonly<{
        stage: "normalize";
        code: "INVALID_SOURCE_RECORD";
        message: "Finance source returned an invalid record batch";
      }>
    | Readonly<{
        stage: "persist";
        code: "STORE_UNAVAILABLE";
        message: "Finance records could not be persisted";
      }>;
}>;

export type FinanceIngestionRunResult =
  FinanceIngestionReadyResult | FinanceIngestionDegradedResult;

export type FinanceIngestionRunOptions = Readonly<{
  cursor?: string;
  clock?: () => string;
  maxAttempts?: number;
  shouldRetry?: (error: unknown, failedAttempt: number) => boolean;
  retryDelay?: (failedAttempt: number, error: unknown) => Promise<void>;
}>;

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 5;

class SourceFetchFailed extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause: unknown) {
    super("Finance source fetch failed", { cause });
    this.name = "SourceFetchFailed";
    this.attempts = attempts;
  }
}

const defaultRetryDelay = async (failedAttempt: number): Promise<void> => {
  const delayMilliseconds = Math.min(30_000, 1_000 * 2 ** (failedAttempt - 1));
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMilliseconds);
  });
};

const fetchBatchWithRetry = async (
  source: FinanceSourceAdapter,
  cursor: string | undefined,
  maxAttempts: number,
  shouldRetry: (error: unknown, failedAttempt: number) => boolean,
  retryDelay: (failedAttempt: number, error: unknown) => Promise<void>,
): Promise<Readonly<{ attempts: number; batch: FinanceSourceBatch }>> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const batch = await source.fetch(cursor === undefined ? {} : { cursor });
      return { attempts: attempt, batch };
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new SourceFetchFailed(attempt, error);
      }
      let retryAllowed: boolean;
      try {
        retryAllowed = shouldRetry(error, attempt);
      } catch (policyError) {
        throw new SourceFetchFailed(attempt, policyError);
      }
      if (!retryAllowed) {
        throw new SourceFetchFailed(attempt, error);
      }
      try {
        await retryDelay(attempt, error);
      } catch (delayError) {
        throw new SourceFetchFailed(attempt, delayError);
      }
    }
  }
  throw new Error("finance ingestion retry loop exhausted unexpectedly");
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

const canonicalTimestamp = (value: string): string =>
  new Date(value).toISOString();

const contentHash = (record: Readonly<Record<string, unknown>>): string =>
  `sha256:${createHash("sha256")
    .update(canonicalJson(record), "utf8")
    .digest("hex")}`;

const assertSourceBatch: (
  value: FinanceSourceBatch,
) => asserts value is FinanceSourceBatch = (value) => {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray(value.records) ||
    value.records.length > 1_000 ||
    (value.nextCursor !== undefined &&
      (typeof value.nextCursor !== "string" ||
        value.nextCursor.length < 1 ||
        value.nextCursor.length > 2_048 ||
        /\p{Cc}/u.test(value.nextCursor)))
  ) {
    throw new TypeError("finance source batch violates its contract");
  }
};

const assertPersistResult = (
  value: FinanceRecordPersistResult,
  expectedRecords: number,
): void => {
  const counts = [value.created, value.updated, value.duplicates];
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    counts.reduce((total, count) => total + count, 0) !== expectedRecords
  ) {
    throw new TypeError("finance store returned invalid atomic counts");
  }
};

const degradedResult = (
  descriptor: FinanceSourceDescriptor,
  attempts: number,
  fetched: number,
  failure: FinanceIngestionDegradedResult["failure"],
): FinanceIngestionDegradedResult => ({
  status: "degraded",
  source: descriptor.source,
  sourceMode: descriptor.sourceMode,
  attempts,
  fetched,
  created: 0,
  updated: 0,
  duplicates: 0,
  records: [],
  failure,
});

const normalizeRecord = (
  descriptor: FinanceSourceDescriptor,
  sourceRecord: FinanceSourceRecord,
  fetchedAt: string,
): NormalizedFinanceRecord => {
  const parsed = financeSourceRecordSchema.parse(sourceRecord);
  const normalized = {
    ...parsed,
    source: descriptor.source,
    sourceMode: descriptor.sourceMode,
    publishedAt: canonicalTimestamp(parsed.publishedAt),
    entitlement: descriptor.entitlement,
    license: descriptor.license,
    delaySeconds: descriptor.delaySeconds,
    sourceCapabilities: descriptor.capabilities,
    licenseUrl: descriptor.licenseUrl,
    licenseScope: descriptor.licenseScope,
    externalDisplayAllowed: descriptor.externalDisplayAllowed,
    bodyStorageAllowed: descriptor.bodyStorageAllowed,
    attribution: descriptor.attribution,
    licenseVerifiedAt: canonicalTimestamp(descriptor.licenseVerifiedAt),
    officialSource: descriptor.officialSource,
    nativeCadenceSeconds: descriptor.nativeCadenceSeconds,
    minPollIntervalSeconds: descriptor.minPollIntervalSeconds,
    staleAfterSeconds: descriptor.staleAfterSeconds,
    redistributionAllowed: descriptor.redistributionAllowed,
    transformationAllowed: descriptor.transformationAllowed,
    attributionRequired: descriptor.attributionRequired,
    termsVerifiedAt: canonicalTimestamp(descriptor.termsVerifiedAt),
    rawRetentionDays: descriptor.rawRetentionDays,
    licenseSnapshotId: descriptor.licenseSnapshotId,
  } as const;
  return normalizedFinanceRecordSchema.parse({
    ...normalized,
    fetchedAt,
    contentHash: contentHash(normalized),
  });
};

export const runFinanceIngestion = async (
  source: FinanceSourceAdapter,
  store: FinanceRecordStore,
  options: FinanceIngestionRunOptions = {},
): Promise<FinanceIngestionRunResult> => {
  const descriptor = financeSourceDescriptorSchema.parse(source.descriptor);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_ATTEMPTS
  ) {
    throw new RangeError(`maxAttempts must be between 1 and ${MAX_ATTEMPTS}`);
  }
  let fetched: Readonly<{ attempts: number; batch: FinanceSourceBatch }>;
  try {
    fetched = await fetchBatchWithRetry(
      source,
      options.cursor,
      maxAttempts,
      options.shouldRetry ?? (() => true),
      options.retryDelay ?? defaultRetryDelay,
    );
  } catch (error) {
    if (!(error instanceof SourceFetchFailed)) throw error;
    return degradedResult(descriptor, error.attempts, 0, {
      stage: "fetch",
      code: "SOURCE_UNAVAILABLE",
      message: "Finance source is temporarily unavailable",
    });
  }
  const { batch } = fetched;
  let records: readonly NormalizedFinanceRecord[];
  try {
    assertSourceBatch(batch);
    const fetchedAt = canonicalTimestamp(
      (options.clock ?? (() => new Date().toISOString()))(),
    );
    records = batch.records.map((record) =>
      normalizeRecord(descriptor, record, fetchedAt),
    );
  } catch {
    const sourceRecordCount = Array.isArray(batch.records)
      ? batch.records.length
      : 0;
    return degradedResult(descriptor, fetched.attempts, sourceRecordCount, {
      stage: "normalize",
      code: "INVALID_SOURCE_RECORD",
      message: "Finance source returned an invalid record batch",
    });
  }
  let persisted: FinanceRecordPersistResult;
  try {
    persisted = await store.persist(records);
    assertPersistResult(persisted, records.length);
  } catch {
    return degradedResult(descriptor, fetched.attempts, records.length, {
      stage: "persist",
      code: "STORE_UNAVAILABLE",
      message: "Finance records could not be persisted",
    });
  }

  return {
    status: "ready",
    source: descriptor.source,
    sourceMode: descriptor.sourceMode,
    attempts: fetched.attempts,
    fetched: records.length,
    ...persisted,
    ...(batch.nextCursor === undefined ? {} : { nextCursor: batch.nextCursor }),
    records,
  };
};
