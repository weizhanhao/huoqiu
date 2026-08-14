import {
  type FinanceIngestionJob,
  type FinanceScheduledResult,
} from "./scheduler.js";

export interface FinanceRefreshCoordinator {
  runAll(
    jobs: readonly FinanceIngestionJob[],
  ): Promise<readonly FinanceScheduledResult[]>;
}

export interface FinanceRefreshTimer {
  clear(handle: object): void;
  set(callback: () => void, delayMilliseconds: number): object;
}

export type FinanceSnapshotRefreshRuntimeOptions = Readonly<{
  coordinator: FinanceRefreshCoordinator;
  jobs: readonly FinanceIngestionJob[];
  onUnexpectedError?: (error: unknown, source: string) => void;
  timer?: FinanceRefreshTimer;
}>;

const nativeTimer: FinanceRefreshTimer = {
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  set: (callback, delayMilliseconds) =>
    setTimeout(callback, delayMilliseconds),
};

export class FinanceSnapshotRefreshRuntime {
  readonly name = "finance-public-snapshot";
  readonly #coordinator: FinanceRefreshCoordinator;
  readonly #jobs: readonly FinanceIngestionJob[];
  readonly #onUnexpectedError: (error: unknown, source: string) => void;
  readonly #scheduled = new Map<string, object>();
  readonly #timer: FinanceRefreshTimer;
  #generation = 0;
  readonly #inFlight = new Set<Promise<void>>();
  #running = false;

  constructor(options: FinanceSnapshotRefreshRuntimeOptions) {
    if (options.jobs.length === 0) {
      throw new TypeError("Finance snapshot refresh requires at least one job");
    }
    this.#coordinator = options.coordinator;
    this.#jobs = options.jobs;
    this.#onUnexpectedError = options.onUnexpectedError ?? (() => undefined);
    this.#timer = options.timer ?? nativeTimer;
  }

  async runOnce(): Promise<readonly FinanceScheduledResult[]> {
    return await this.#coordinator.runAll(this.#jobs);
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    const generation = (this.#generation += 1);
    try {
      await this.runOnce();
      if (!this.#running || this.#generation !== generation) return;
      for (const job of this.#jobs) this.#schedule(job, generation);
    } catch (error) {
      this.#running = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#generation += 1;
    for (const handle of this.#scheduled.values()) {
      this.#timer.clear(handle);
    }
    this.#scheduled.clear();
    await Promise.allSettled([...this.#inFlight]);
  }

  #schedule(job: FinanceIngestionJob, generation: number): void {
    const source = job.source.descriptor.source;
    const handle = this.#timer.set(() => {
      this.#scheduled.delete(source);
      const refresh = this.#refresh(job, generation);
      this.#inFlight.add(refresh);
      void refresh.finally(() => this.#inFlight.delete(refresh));
    }, job.source.descriptor.minPollIntervalSeconds * 1_000);
    this.#scheduled.set(source, handle);
  }

  async #refresh(job: FinanceIngestionJob, generation: number): Promise<void> {
    try {
      await this.#coordinator.runAll([job]);
    } catch (error) {
      this.#onUnexpectedError(error, job.source.descriptor.source);
    } finally {
      if (this.#running && this.#generation === generation) {
        this.#schedule(job, generation);
      }
    }
  }
}
