import {
  financeSourceDescriptorSchema,
  type FinanceSourceDescriptor,
} from "@huoqiu/contracts/finance/ingestion-v1";
import type { PublicFinanceSnapshot } from "@huoqiu/contracts/finance/public-snapshot-v1";

import {
  runFinanceIngestion,
  type FinanceIngestionRunOptions,
  type FinanceIngestionRunResult,
  type FinanceRecordStore,
  type FinanceSourceAdapter,
} from "../ingestion.js";
import {
  createPublicFinanceSnapshot,
  type FinanceSourcePublication,
} from "./public-snapshot.js";

export interface FinanceCursorStore {
  read(source: string): Promise<string | undefined>;
  commit(source: string, cursor: string | undefined): Promise<void>;
}

export interface PublicFinanceSnapshotRepository {
  readLatestValid(): Promise<PublicFinanceSnapshot | null>;
  publish(snapshot: PublicFinanceSnapshot): Promise<void>;
}

export type FinanceIngestionJob = Readonly<{
  source: FinanceSourceAdapter;
  recordStore: FinanceRecordStore;
  maxAttempts?: number;
  retryDelay?: FinanceIngestionRunOptions["retryDelay"];
}>;

export type FinanceScheduledPublication = Readonly<{
  status: "published";
  source: string;
  generatedAt: string;
  ingestion: FinanceIngestionRunResult;
}>;

export type FinanceScheduledFailureCode =
  | "CURSOR_STORE_UNAVAILABLE"
  | "SNAPSHOT_STORE_UNAVAILABLE"
  | "SCHEDULER_UNAVAILABLE";

export type FinanceScheduledFailure = Readonly<{
  status: "failed";
  source: string;
  failure: Readonly<{
    code: FinanceScheduledFailureCode;
    message:
      | "Finance ingestion cursor could not be read or committed"
      | "Finance public snapshot could not be read or published"
      | "Finance ingestion job could not be scheduled";
  }>;
}>;

export type FinanceScheduledResult =
  FinanceScheduledPublication | FinanceScheduledFailure;

export type FinanceIngestionCoordinatorOptions = Readonly<{
  cursorStore: FinanceCursorStore;
  snapshotRepository: PublicFinanceSnapshotRepository;
  clock?: () => string;
}>;

type CoordinatorFailureDetails = Readonly<{
  code: FinanceScheduledFailureCode;
  message: FinanceScheduledFailure["failure"]["message"];
}>;

class FinanceCoordinatorError extends Error {
  readonly details: CoordinatorFailureDetails;

  constructor(details: CoordinatorFailureDetails, cause: unknown) {
    super(details.message, { cause });
    this.name = "FinanceCoordinatorError";
    this.details = details;
  }
}

const cursorFailure = {
  code: "CURSOR_STORE_UNAVAILABLE",
  message: "Finance ingestion cursor could not be read or committed",
} as const;

const snapshotFailure = {
  code: "SNAPSHOT_STORE_UNAVAILABLE",
  message: "Finance public snapshot could not be read or published",
} as const;

const schedulerFailure = {
  code: "SCHEDULER_UNAVAILABLE",
  message: "Finance ingestion job could not be scheduled",
} as const;

const publicationQueues = new WeakMap<
  PublicFinanceSnapshotRepository,
  Promise<void>
>();
const inFlightRuns = new WeakMap<
  FinanceCursorStore,
  WeakMap<
    PublicFinanceSnapshotRepository,
    Map<string, Promise<FinanceScheduledPublication>>
  >
>();

const sharedInFlightBySource = (
  cursorStore: FinanceCursorStore,
  snapshotRepository: PublicFinanceSnapshotRepository,
): Map<string, Promise<FinanceScheduledPublication>> => {
  let repositories = inFlightRuns.get(cursorStore);
  if (repositories === undefined) {
    repositories = new WeakMap();
    inFlightRuns.set(cursorStore, repositories);
  }
  let sources = repositories.get(snapshotRepository);
  if (sources === undefined) {
    sources = new Map();
    repositories.set(snapshotRepository, sources);
  }
  return sources;
};

const canonicalTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Finance ingestion scheduler clock is invalid");
  }
  return timestamp.toISOString();
};

const canonicalDescriptor = (
  value: FinanceSourceDescriptor,
): FinanceSourceDescriptor => {
  const descriptor = financeSourceDescriptorSchema.parse(value);
  return financeSourceDescriptorSchema.parse({
    ...descriptor,
    historyStartAt: canonicalTimestamp(descriptor.historyStartAt),
    licenseVerifiedAt: canonicalTimestamp(descriptor.licenseVerifiedAt),
    termsVerifiedAt: canonicalTimestamp(descriptor.termsVerifiedAt),
    robotsCheckedAt:
      descriptor.robotsCheckedAt === null
        ? null
        : canonicalTimestamp(descriptor.robotsCheckedAt),
  });
};

const verifiedPublicDescriptor = (
  value: FinanceSourceDescriptor,
): FinanceSourceDescriptor => {
  if (value.sourceMode !== "real") {
    throw new TypeError(
      "Finance ingestion scheduler requires a verified real metadata-only public source",
    );
  }
  const descriptor = canonicalDescriptor(value);
  if (
    descriptor.sourceMode !== "real" ||
    !descriptor.externalDisplayAllowed ||
    descriptor.bodyStorageAllowed ||
    descriptor.imageStorageAllowed
  ) {
    throw new TypeError(
      "Finance ingestion scheduler requires a verified real metadata-only public source",
    );
  }
  return descriptor;
};

const publicSource = (
  source: FinanceSourceAdapter,
  descriptor: FinanceSourceDescriptor,
): FinanceSourceAdapter => ({
  descriptor,
  fetch: (input) => source.fetch(input),
});

const monotonicGeneratedAt = (
  clockValue: string,
  attemptedAt: string,
  previous: PublicFinanceSnapshot | null,
): string => {
  const candidates = [
    canonicalTimestamp(clockValue),
    attemptedAt,
    ...(previous === null ? [] : [previous.generatedAt]),
  ];
  return candidates.reduce((latest, candidate) =>
    Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
  );
};

export class FinanceIngestionCoordinator {
  readonly #clock: () => string;
  readonly #cursorStore: FinanceCursorStore;
  readonly #inFlightBySource: Map<string, Promise<FinanceScheduledPublication>>;
  readonly #snapshotRepository: PublicFinanceSnapshotRepository;

  constructor(options: FinanceIngestionCoordinatorOptions) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#cursorStore = options.cursorStore;
    this.#snapshotRepository = options.snapshotRepository;
    this.#inFlightBySource = sharedInFlightBySource(
      options.cursorStore,
      options.snapshotRepository,
    );
  }

  async run(job: FinanceIngestionJob): Promise<FinanceScheduledPublication> {
    const descriptor = verifiedPublicDescriptor(job.source.descriptor);
    const existing = this.#inFlightBySource.get(descriptor.source);
    if (existing !== undefined) return existing;

    const execution = this.#execute(job, descriptor).finally(() => {
      if (this.#inFlightBySource.get(descriptor.source) === execution) {
        this.#inFlightBySource.delete(descriptor.source);
      }
    });
    this.#inFlightBySource.set(descriptor.source, execution);
    return execution;
  }

  async runAll(
    jobs: readonly FinanceIngestionJob[],
  ): Promise<readonly FinanceScheduledResult[]> {
    const sources = jobs.map(
      (job) => verifiedPublicDescriptor(job.source.descriptor).source,
    );
    if (new Set(sources).size !== sources.length) {
      throw new TypeError(
        "Finance ingestion cycle cannot contain the same source more than once",
      );
    }

    return Promise.all(
      jobs.map(async (job, index): Promise<FinanceScheduledResult> => {
        try {
          return await this.run(job);
        } catch (error) {
          const details =
            error instanceof FinanceCoordinatorError
              ? error.details
              : schedulerFailure;
          return {
            status: "failed",
            source: sources[index] as string,
            failure: details,
          };
        }
      }),
    );
  }

  async #execute(
    job: FinanceIngestionJob,
    descriptor: FinanceSourceDescriptor,
  ): Promise<FinanceScheduledPublication> {
    const attemptedAt = canonicalTimestamp(this.#clock());
    let cursor: string | undefined;
    try {
      cursor = await this.#cursorStore.read(descriptor.source);
    } catch (error) {
      throw new FinanceCoordinatorError(cursorFailure, error);
    }

    let ingestion: FinanceIngestionRunResult;
    try {
      ingestion = await runFinanceIngestion(
        publicSource(job.source, descriptor),
        job.recordStore,
        {
          ...(cursor === undefined ? {} : { cursor }),
          clock: () => attemptedAt,
          ...(job.maxAttempts === undefined
            ? {}
            : { maxAttempts: job.maxAttempts }),
          ...(job.retryDelay === undefined
            ? {}
            : { retryDelay: job.retryDelay }),
        },
      );
    } catch (error) {
      throw new FinanceCoordinatorError(schedulerFailure, error);
    }

    let snapshot: PublicFinanceSnapshot;
    try {
      snapshot = await this.#serializePublication(async () => {
        const previous = await this.#snapshotRepository.readLatestValid();
        const publication: FinanceSourcePublication = {
          descriptor,
          attemptedAt,
          continuation: cursor !== undefined,
          result: ingestion,
        };
        const next = createPublicFinanceSnapshot({
          generatedAt: monotonicGeneratedAt(
            this.#clock(),
            attemptedAt,
            previous,
          ),
          publications: [publication],
          ...(previous === null ? {} : { previous }),
        });
        await this.#snapshotRepository.publish(next);
        return next;
      });
    } catch (error) {
      throw new FinanceCoordinatorError(snapshotFailure, error);
    }

    if (ingestion.status === "ready") {
      try {
        await this.#cursorStore.commit(descriptor.source, ingestion.nextCursor);
      } catch (error) {
        throw new FinanceCoordinatorError(cursorFailure, error);
      }
    }

    return {
      status: "published",
      source: descriptor.source,
      generatedAt: snapshot.generatedAt,
      ingestion,
    };
  }

  #serializePublication<Result>(work: () => Promise<Result>): Promise<Result> {
    const previous =
      publicationQueues.get(this.#snapshotRepository) ?? Promise.resolve();
    const operation = previous.then(work, work);
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    publicationQueues.set(this.#snapshotRepository, settled);
    void settled.then(() => {
      if (publicationQueues.get(this.#snapshotRepository) === settled) {
        publicationQueues.delete(this.#snapshotRepository);
      }
    });
    return operation;
  }
}
