import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import {
  financeSourceDescriptorSchema,
  type FinanceSourceDescriptor,
} from "@huoqiu/contracts/finance/ingestion-v1";
import {
  publicFinanceSnapshotSchema,
  type PublicFinanceSnapshot,
  type PublicFinanceSourceState,
} from "@huoqiu/contracts/finance/public-snapshot-v1";

import type { FinanceIngestionRunResult } from "../ingestion.js";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const CURRENT_FILENAME = "public-v1.json";
const PREVIOUS_FILENAME = "public-v1.previous.json";

export type FinanceSourcePublication = Readonly<{
  descriptor: FinanceSourceDescriptor;
  attemptedAt: string;
  result: FinanceIngestionRunResult;
}>;

export type CreatePublicFinanceSnapshotInput = Readonly<{
  generatedAt: string;
  publications: readonly FinanceSourcePublication[];
  previous?: PublicFinanceSnapshot;
}>;

const canonicalTimestamp = (value: string): string =>
  new Date(value).toISOString();

const staleAtFor = (
  lastSuccessAt: string,
  descriptor: FinanceSourceDescriptor,
): string =>
  new Date(
    Date.parse(lastSuccessAt) + descriptor.staleAfterSeconds * 1_000,
  ).toISOString();

const recordsForSource = (
  snapshot: PublicFinanceSnapshot | undefined,
  source: string,
) =>
  snapshot?.records.filter((record) => record.provenance.source === source) ??
  [];

const stateForReadyPublication = (
  descriptor: FinanceSourceDescriptor,
  attemptedAt: string,
  recordCount: number,
): PublicFinanceSourceState => ({
  descriptor,
  lastRunStatus: recordCount === 0 ? "empty" : "ready",
  lastAttemptAt: attemptedAt,
  lastSuccessAt: attemptedAt,
  staleAt: staleAtFor(attemptedAt, descriptor),
});

const stateForDegradedPublication = (
  descriptorInput: FinanceSourceDescriptor,
  failureCode:
    "SOURCE_UNAVAILABLE" | "INVALID_SOURCE_RECORD" | "STORE_UNAVAILABLE",
  attemptedAt: string,
  previousState: PublicFinanceSourceState | undefined,
): PublicFinanceSourceState => {
  const descriptor = previousState?.descriptor ?? descriptorInput;
  return {
    descriptor,
    lastRunStatus: "degraded",
    lastAttemptAt: attemptedAt,
    lastSuccessAt: previousState?.lastSuccessAt ?? null,
    staleAt: previousState?.staleAt ?? null,
    failureCode,
  };
};

export const createPublicFinanceSnapshot = (
  input: CreatePublicFinanceSnapshotInput,
): PublicFinanceSnapshot => {
  const generatedAt = canonicalTimestamp(input.generatedAt);
  const previous =
    input.previous === undefined
      ? undefined
      : publicFinanceSnapshotSchema.parse(input.previous);
  if (
    previous !== undefined &&
    Date.parse(generatedAt) < Date.parse(previous.generatedAt)
  ) {
    throw new RangeError(
      "Public finance snapshot generation cannot move backwards",
    );
  }

  const sourceStates = new Map(
    previous?.sources.map((state) => [state.descriptor.source, state]) ?? [],
  );
  const recordsBySource = new Map<string, PublicFinanceSnapshot["records"]>(
    previous?.sources.map((state) => [
      state.descriptor.source,
      recordsForSource(previous, state.descriptor.source),
    ]) ?? [],
  );
  const publicationSources = new Set<string>();

  for (const publication of input.publications) {
    const descriptor = financeSourceDescriptorSchema.parse(
      publication.descriptor,
    );
    const attemptedAt = canonicalTimestamp(publication.attemptedAt);
    if (
      descriptor.sourceMode !== "real" ||
      publication.result.sourceMode !== "real" ||
      publication.result.source !== descriptor.source
    ) {
      throw new TypeError(
        "Public finance publication must match one verified real source",
      );
    }
    if (publicationSources.has(descriptor.source)) {
      throw new TypeError(
        "Public finance publication contains the same source more than once",
      );
    }
    publicationSources.add(descriptor.source);

    const previousState = sourceStates.get(descriptor.source);
    if (publication.result.status === "ready") {
      sourceStates.set(
        descriptor.source,
        stateForReadyPublication(
          descriptor,
          attemptedAt,
          publication.result.records.length,
        ),
      );
      recordsBySource.set(descriptor.source, [...publication.result.records]);
    } else {
      sourceStates.set(
        descriptor.source,
        stateForDegradedPublication(
          descriptor,
          publication.result.failure.code,
          attemptedAt,
          previousState,
        ),
      );
      if (!recordsBySource.has(descriptor.source)) {
        recordsBySource.set(descriptor.source, []);
      }
    }
  }

  const sources = [...sourceStates.values()].sort((left, right) =>
    left.descriptor.source.localeCompare(right.descriptor.source),
  );
  const records = [...recordsBySource.values()]
    .flat()
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.provenance.source.localeCompare(right.provenance.source) ||
        left.sourceRecordId.localeCompare(right.sourceRecordId),
    )
    .slice(0, 250);

  return publicFinanceSnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt,
    sources,
    records,
  });
};

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as Error & { code?: unknown }).code === "ENOENT";

const readSnapshotFile = async (
  path: string,
): Promise<PublicFinanceSnapshot | null> => {
  try {
    const contents = await readFile(path, "utf8");
    return publicFinanceSnapshotSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
};

const writeSyncedFile = async (
  path: string,
  contents: string,
): Promise<void> => {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(contents, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
};

export class AtomicJsonPublicFinanceSnapshotStore {
  readonly #directory: string;
  readonly #maxBytes: number;

  constructor(input: Readonly<{ directory: string; maxBytes?: number }>) {
    if (!isAbsolute(input.directory)) {
      throw new TypeError(
        "Public finance snapshot directory must be an absolute path",
      );
    }
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 128 ||
      maxBytes > DEFAULT_MAX_BYTES
    ) {
      throw new RangeError(
        "Public finance snapshot maximum byte size must be between 128 and 2097152",
      );
    }
    this.#directory = input.directory;
    this.#maxBytes = maxBytes;
  }

  async readCurrent(): Promise<PublicFinanceSnapshot | null> {
    return readSnapshotFile(join(this.#directory, CURRENT_FILENAME));
  }

  async readPrevious(): Promise<PublicFinanceSnapshot | null> {
    return readSnapshotFile(join(this.#directory, PREVIOUS_FILENAME));
  }

  async readLatestValid(): Promise<PublicFinanceSnapshot | null> {
    try {
      const current = await this.readCurrent();
      if (current !== null) return current;
    } catch {
      // A corrupt current file must not hide the last independently validated
      // snapshot. The caller still receives no unvalidated content.
    }
    return this.readPrevious();
  }

  async publish(snapshot: PublicFinanceSnapshot): Promise<void> {
    const parsed = publicFinanceSnapshotSchema.parse(snapshot);
    const contents = `${JSON.stringify(parsed)}\n`;
    if (Buffer.byteLength(contents, "utf8") > this.#maxBytes) {
      throw new RangeError(
        "Public finance snapshot exceeds the configured maximum byte size",
      );
    }

    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const currentPath = join(this.#directory, CURRENT_FILENAME);
    const previousPath = join(this.#directory, PREVIOUS_FILENAME);
    const nonce = randomUUID();
    const currentTempPath = join(this.#directory, `.public-v1.${nonce}.tmp`);
    const previousTempPath = join(
      this.#directory,
      `.public-v1.previous.${nonce}.tmp`,
    );

    const lastGoodCurrent = await this.readCurrent().catch(() => null);

    try {
      await writeSyncedFile(currentTempPath, contents);
      if (lastGoodCurrent !== null) {
        await writeSyncedFile(
          previousTempPath,
          `${JSON.stringify(lastGoodCurrent)}\n`,
        );
        await rename(previousTempPath, previousPath);
      }
      await rename(currentTempPath, currentPath);
    } catch (error) {
      await Promise.allSettled([
        unlink(currentTempPath),
        unlink(previousTempPath),
      ]);
      throw error;
    }
  }
}
