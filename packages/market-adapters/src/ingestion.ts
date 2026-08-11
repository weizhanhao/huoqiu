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
  records: readonly NormalizedFinanceRecord[];
}>;

export interface FinanceRecordStore {
  persist(
    records: readonly NormalizedFinanceRecord[],
  ): Promise<FinanceRecordPersistResult>;
}

export type FinanceSourceFailureClassification =
  | "transient"
  | "upstream-unavailable"
  | "rate-limited"
  | "access-denied"
  | "invalid-response"
  | "policy-blocked";

export type FinanceSourceRetryInstruction =
  | Readonly<{ kind: "never" }>
  | Readonly<{ kind: "backoff" }>
  | Readonly<{ kind: "after"; delayMilliseconds: number }>;

export class FinanceSourceFetchError extends Error {
  readonly classification: FinanceSourceFailureClassification;
  readonly retry: FinanceSourceRetryInstruction;

  constructor(
    message: string,
    options: Readonly<{
      classification: FinanceSourceFailureClassification;
      retry: FinanceSourceRetryInstruction;
      cause?: unknown;
    }>,
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "FinanceSourceFetchError";
    this.classification = options.classification;
    this.retry = options.retry;

    if (
      options.retry.kind === "after" &&
      (!Number.isSafeInteger(options.retry.delayMilliseconds) ||
        options.retry.delayMilliseconds < 1 ||
        options.retry.delayMilliseconds > 86_400_000)
    ) {
      throw new RangeError(
        "Finance source retry delay must be between 1ms and 24 hours",
      );
    }
    if (
      (options.classification === "access-denied" ||
        options.classification === "invalid-response" ||
        options.classification === "policy-blocked") &&
      options.retry.kind !== "never"
    ) {
      throw new TypeError(
        `Finance source ${options.classification} errors cannot be retried`,
      );
    }
    if (
      options.classification === "rate-limited" &&
      (options.retry.kind === "backoff" ||
        (options.retry.kind === "after" &&
          options.retry.delayMilliseconds < 60_000))
    ) {
      throw new TypeError(
        "Finance source rate-limited errors cannot request a short retry",
      );
    }
  }
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
  retryDelay?: (
    failedAttempt: number,
    error: FinanceSourceFetchError,
    recommendedDelayMilliseconds: number,
  ) => Promise<void>;
}>;

const DEFAULT_MAX_ATTEMPTS = 1;
const MAX_ATTEMPTS = 5;
const cursorPattern = /^[A-Za-z0-9._~:+/=-]{1,2048}$/u;

class SourceFetchFailed extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause: unknown) {
    super("Finance source fetch failed", { cause });
    this.name = "SourceFetchFailed";
    this.attempts = attempts;
  }
}

const validateCursor = (cursor: string): string => {
  if (typeof cursor !== "string" || !cursorPattern.test(cursor)) {
    throw new TypeError("finance ingestion cursor violates its contract");
  }
  return cursor;
};

const recommendedRetryDelay = (
  error: unknown,
  failedAttempt: number,
): Readonly<{
  error: FinanceSourceFetchError;
  delayMilliseconds: number;
}> | null => {
  if (!(error instanceof FinanceSourceFetchError)) return null;
  if (error.retry.kind === "never") return null;
  if (error.retry.kind === "after") {
    return { error, delayMilliseconds: error.retry.delayMilliseconds };
  }
  return {
    error,
    delayMilliseconds: Math.min(30_000, 1_000 * 2 ** (failedAttempt - 1)),
  };
};

const defaultRetryDelay = async (
  _failedAttempt: number,
  _error: FinanceSourceFetchError,
  delayMilliseconds: number,
): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMilliseconds);
  });
};

const fetchBatchWithRetry = async (
  source: FinanceSourceAdapter,
  cursor: string | undefined,
  maxAttempts: number,
  retryDelay: NonNullable<FinanceIngestionRunOptions["retryDelay"]>,
): Promise<Readonly<{ attempts: number; batch: unknown }>> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const batch: unknown = await source.fetch(
        cursor === undefined ? {} : { cursor },
      );
      return { attempts: attempt, batch };
    } catch (error) {
      const retry = recommendedRetryDelay(error, attempt);
      if (attempt === maxAttempts || retry === null) {
        throw new SourceFetchFailed(attempt, error);
      }
      try {
        await retryDelay(attempt, retry.error, retry.delayMilliseconds);
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

const canonicalDescriptor = (
  value: FinanceSourceDescriptor,
): FinanceSourceDescriptor =>
  financeSourceDescriptorSchema.parse({
    ...value,
    historyStartAt: canonicalTimestamp(value.historyStartAt),
    licenseVerifiedAt: canonicalTimestamp(value.licenseVerifiedAt),
    termsVerifiedAt: canonicalTimestamp(value.termsVerifiedAt),
    robotsCheckedAt:
      value.robotsCheckedAt === null
        ? null
        : canonicalTimestamp(value.robotsCheckedAt),
  });

const assertSourceBatch: (
  value: unknown,
) => asserts value is FinanceSourceBatch = (value) => {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("finance source batch violates its contract");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    !Array.isArray(candidate.records) ||
    candidate.records.length > 1_000 ||
    (candidate.nextCursor !== undefined &&
      (typeof candidate.nextCursor !== "string" ||
        !cursorPattern.test(candidate.nextCursor)))
  ) {
    throw new TypeError("finance source batch violates its contract");
  }
};

const safeSourceRecordCount = (value: unknown): number => {
  try {
    if (typeof value !== "object" || value === null) return 0;
    const records = (value as Readonly<Record<string, unknown>>).records;
    return Array.isArray(records) && records.length <= 1_000
      ? records.length
      : 0;
  } catch {
    return 0;
  }
};

const assertUniqueRecordIdentities = (
  records: readonly NormalizedFinanceRecord[],
): void => {
  const identities = new Set<string>();
  for (const record of records) {
    const identity = JSON.stringify([
      record.provenance.source,
      record.sourceRecordId,
    ]);
    if (identities.has(identity)) {
      throw new TypeError("finance source batch contains duplicate identities");
    }
    identities.add(identity);
  }
};

const assertPersistResult = (
  value: unknown,
  expectedRecords: readonly NormalizedFinanceRecord[],
): FinanceRecordPersistResult => {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("finance store returned an invalid result");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const counts = [candidate.created, candidate.updated, candidate.duplicates];
  if (
    counts.some(
      (count) =>
        typeof count !== "number" || !Number.isSafeInteger(count) || count < 0,
    ) ||
    (counts as number[]).reduce((total, count) => total + count, 0) !==
      expectedRecords.length ||
    !Array.isArray(candidate.records) ||
    candidate.records.length !== expectedRecords.length
  ) {
    throw new TypeError("finance store returned invalid atomic persistence");
  }

  const persistedRecords = candidate.records.map((record) =>
    normalizedFinanceRecordSchema.parse(record),
  );
  if (canonicalJson(persistedRecords) !== canonicalJson(expectedRecords)) {
    throw new TypeError("finance store returned stale or mismatched records");
  }

  return {
    created: counts[0] as number,
    updated: counts[1] as number,
    duplicates: counts[2] as number,
    records: persistedRecords,
  };
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
  const revision = {
    ...parsed,
    publishedAt: canonicalTimestamp(parsed.publishedAt),
    provenance: descriptor,
  } as const;
  return normalizedFinanceRecordSchema.parse({
    ...revision,
    fetchedAt,
    lastSeenAt: fetchedAt,
    contentHash: contentHash(revision),
  });
};

export const runFinanceIngestion = async (
  source: FinanceSourceAdapter,
  store: FinanceRecordStore,
  options: FinanceIngestionRunOptions = {},
): Promise<FinanceIngestionRunResult> => {
  const descriptor = canonicalDescriptor(
    financeSourceDescriptorSchema.parse(source.descriptor),
  );
  const cursor =
    options.cursor === undefined ? undefined : validateCursor(options.cursor);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_ATTEMPTS
  ) {
    throw new RangeError(`maxAttempts must be between 1 and ${MAX_ATTEMPTS}`);
  }

  let fetched: Readonly<{ attempts: number; batch: unknown }>;
  try {
    fetched = await fetchBatchWithRetry(
      source,
      cursor,
      maxAttempts,
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

  let batch: FinanceSourceBatch;
  let records: readonly NormalizedFinanceRecord[];
  try {
    assertSourceBatch(fetched.batch);
    batch = fetched.batch;
    const fetchedAt = canonicalTimestamp(
      (options.clock ?? (() => new Date().toISOString()))(),
    );
    records = batch.records.map((record) =>
      normalizeRecord(descriptor, record, fetchedAt),
    );
    assertUniqueRecordIdentities(records);
  } catch {
    return degradedResult(
      descriptor,
      fetched.attempts,
      safeSourceRecordCount(fetched.batch),
      {
        stage: "normalize",
        code: "INVALID_SOURCE_RECORD",
        message: "Finance source returned an invalid record batch",
      },
    );
  }

  let persisted: FinanceRecordPersistResult;
  try {
    persisted = assertPersistResult(await store.persist(records), records);
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
    created: persisted.created,
    updated: persisted.updated,
    duplicates: persisted.duplicates,
    ...(batch.nextCursor === undefined ? {} : { nextCursor: batch.nextCursor }),
    records: persisted.records,
  };
};
