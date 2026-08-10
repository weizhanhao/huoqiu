import { randomUUID } from "node:crypto";

import type {
  DeadLetterEvent,
  DlqStorePort,
} from "./dlq-store.js";

export interface ConsumableEvent extends DeadLetterEvent {
  readonly aggregate_id: string;
  readonly aggregate_type: string;
  readonly sequence: string;
}

export type InboxReceipt = Readonly<{
  consumer: string;
  event_id: string;
}>;

export interface InboxTransaction {
  claimInbox(receipt: InboxReceipt): Promise<boolean> | boolean;
}

export type AggregateSequenceKey = Readonly<{
  aggregate_id: string;
  aggregate_type: string;
  consumer: string;
}>;

export interface ConsumerTransaction extends InboxTransaction {
  acquireAggregateLock(key: AggregateSequenceKey): Promise<void> | void;
  advanceSequence(
    key: AggregateSequenceKey,
    expectedSequence: string,
    nextExpectedSequence: string,
  ): Promise<boolean> | boolean;
  deferDelivery(
    request: DeferredDeliveryRequest<ConsumableEvent>,
  ): Promise<void> | void;
  expectedSequence(key: AggregateSequenceKey): Promise<string> | string;
  /** Upsert one durable sweep hint per aggregate in this same transaction. */
  scheduleDeferredWakeup(
    wakeup: DeferredWakeupRequest,
  ): Promise<void> | void;
}

export interface ConsumerUnitOfWork<Transaction extends ConsumerTransaction> {
  transaction<Result>(
    work: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
}

export type ConsumerHandler<
  Transaction extends ConsumerTransaction,
  Event extends ConsumableEvent,
> = (transaction: Transaction, event: Event) => Promise<void> | void;

export type DeferredDeliveryRequest<Event extends ConsumableEvent> = Readonly<{
  consumer: string;
  event: Event;
  expectedSequence: string;
  key: AggregateSequenceKey;
}>;

export type DeferredWakeupRequest = Readonly<{
  expectedSequence: string;
  key: AggregateSequenceKey;
}>;

export type DeferredDeliveryClaim<Event extends ConsumableEvent> = Readonly<{
  claimId: string;
  event: Event;
  leaseExpiresAt: number;
  leaseOwner: string;
}>;

export interface DeferredDeliveryPort<Event extends ConsumableEvent> {
  /**
   * Claim rows persisted by ConsumerTransaction.deferDelivery, reclaiming
   * expired leases and retiring stale hints within a bounded batch.
   */
  claimReadyBatch(request: {
    consumer: string;
    leaseDurationMs: number;
    leaseOwner: string;
    limit: number;
  }):
    | Promise<readonly DeferredDeliveryClaim<Event>[]>
    | readonly DeferredDeliveryClaim<Event>[];
  completeClaim(
    claim: DeferredDeliveryClaim<Event>,
  ): Promise<void> | void;
  releaseClaim(
    claim: DeferredDeliveryClaim<Event>,
  ): Promise<void> | void;
}

export type IntakeDisposition = Readonly<{
  action: "ack" | "dead-letter" | "defer";
  result: DeliveryResult;
}>;

export interface ConsumerIntakePort<Event extends ConsumableEvent> {
  start(
    deliver: (event: Event) => Promise<IntakeDisposition>,
  ): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type ConsumerRunnerOptions<
  Transaction extends ConsumerTransaction,
  Event extends ConsumableEvent,
> = Readonly<{
  consumer: string;
  deferred: DeferredDeliveryPort<Event>;
  deferredBatchSize?: number;
  deferredLeaseDurationMs?: number;
  deferredSweepIntervalMs?: number;
  dlq: DlqStorePort<Event>;
  handler: ConsumerHandler<Transaction, Event>;
  intake?: ConsumerIntakePort<Event>;
  maxAttempts: number;
  unitOfWork: ConsumerUnitOfWork<Transaction>;
}>;

export type DeliveryResult =
  | Readonly<{
      attempts: number;
      status: "duplicate" | "processed";
    }>
  | Readonly<{
      attempts: number;
      expectedSequence: string;
      status: "deferred" | "stale";
    }>
  | Readonly<{
      attempts: number;
      status: "dead-lettered";
    }>;

export type ReplayResult =
  | DeliveryResult
  | Readonly<{
      attempts: 0;
      status: "not-found";
    }>;

export type DeferredRecoveryResult = Readonly<{
  claimed: number;
  completed: number;
  released: number;
}>;

type DeliveryAttemptResult =
  | Readonly<{ status: "duplicate" }>
  | Readonly<{
      expectedSequence: string;
      status: "deferred";
    }>
  | Readonly<{
      expectedSequence: string;
      status: "stale";
    }>
  | Readonly<{
      status: "processed";
    }>;

class SequenceConflictError extends Error {
  constructor() {
    super("Aggregate sequence compare-and-swap failed");
  }
}

export class ConsumerRunner<
  Transaction extends ConsumerTransaction,
  Event extends ConsumableEvent,
> {
  readonly name = "inbox-consumer";
  readonly #consumer: string;
  readonly #deferred: DeferredDeliveryPort<Event>;
  readonly #deferredBatchSize: number;
  readonly #deferredLeaseDurationMs: number;
  readonly #deferredLeaseOwner = randomUUID();
  readonly #deferredSweepIntervalMs: number;
  readonly #dlq: DlqStorePort<Event>;
  readonly #handler: ConsumerHandler<Transaction, Event>;
  readonly #intake: ConsumerIntakePort<Event> | undefined;
  readonly #maxAttempts: number;
  readonly #unitOfWork: ConsumerUnitOfWork<Transaction>;
  #running = false;
  #sweepLoop: Promise<void> | undefined;
  #sweepRequested = false;
  #wakeSweep: (() => void) | undefined;

  constructor(options: ConsumerRunnerOptions<Transaction, Event>) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer");
    }
    const deferredBatchSize = options.deferredBatchSize ?? 100;
    if (
      !Number.isSafeInteger(deferredBatchSize) ||
      deferredBatchSize < 1
    ) {
      throw new RangeError("deferredBatchSize must be a positive integer");
    }
    const deferredLeaseDurationMs =
      options.deferredLeaseDurationMs ?? 30_000;
    if (
      !Number.isSafeInteger(deferredLeaseDurationMs) ||
      deferredLeaseDurationMs < 1
    ) {
      throw new RangeError(
        "deferredLeaseDurationMs must be a positive integer",
      );
    }
    const deferredSweepIntervalMs =
      options.deferredSweepIntervalMs ?? 1_000;
    if (
      !Number.isSafeInteger(deferredSweepIntervalMs) ||
      deferredSweepIntervalMs < 1
    ) {
      throw new RangeError(
        "deferredSweepIntervalMs must be a positive integer",
      );
    }
    this.#consumer = options.consumer;
    this.#deferred = options.deferred;
    this.#deferredBatchSize = deferredBatchSize;
    this.#deferredLeaseDurationMs = deferredLeaseDurationMs;
    this.#deferredSweepIntervalMs = deferredSweepIntervalMs;
    this.#dlq = options.dlq;
    this.#handler = options.handler;
    this.#intake = options.intake;
    this.#maxAttempts = options.maxAttempts;
    this.#unitOfWork = options.unitOfWork;
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#sweepRequested = false;
    try {
      const initialRecovery = await this.recoverDeferred();
      await this.#intake?.start(async (event) => {
        const result = await this.deliver(event);
        const action =
          result.status === "deferred"
            ? "defer"
            : result.status === "dead-lettered"
              ? "dead-letter"
              : "ack";
        return { action, result };
      });
      this.#sweepLoop = this.#runSweepLoop(
        initialRecovery.completed > 0,
      );
    } catch (error) {
      this.#running = false;
      this.#requestSweep();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#requestSweep();
    await this.#intake?.stop();
    await this.#sweepLoop;
    this.#sweepLoop = undefined;
  }

  #requestSweep(): void {
    this.#sweepRequested = true;
    this.#wakeSweep?.();
  }

  async #waitForSweep(delayMilliseconds: number): Promise<void> {
    if (this.#sweepRequested) {
      this.#sweepRequested = false;
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.#wakeSweep === finish) this.#wakeSweep = undefined;
        this.#sweepRequested = false;
        resolve();
      };
      const timer = setTimeout(finish, delayMilliseconds);
      this.#wakeSweep = finish;
    });
  }

  async #runSweepLoop(runImmediately: boolean): Promise<void> {
    let delayMilliseconds = runImmediately
      ? 0
      : this.#deferredSweepIntervalMs;
    while (this.#running) {
      await this.#waitForSweep(delayMilliseconds);
      if (!this.#running) return;
      try {
        const recovery = await this.recoverDeferred();
        delayMilliseconds =
          recovery.completed > 0 ? 0 : this.#deferredSweepIntervalMs;
      } catch {
        delayMilliseconds = this.#deferredSweepIntervalMs;
      }
    }
  }

  async #attemptDelivery(event: Event): Promise<DeliveryAttemptResult> {
    return await this.#unitOfWork.transaction(async (transaction) => {
      const sequenceKey = {
        aggregate_id: event.aggregate_id,
        aggregate_type: event.aggregate_type,
        consumer: this.#consumer,
      };
      await transaction.acquireAggregateLock(sequenceKey);
      const expectedSequence = await transaction.expectedSequence(sequenceKey);
      const deliveredSequence = BigInt(event.sequence);
      const expected = BigInt(expectedSequence);
      if (deliveredSequence > expected) {
        await transaction.deferDelivery({
          consumer: this.#consumer,
          event,
          expectedSequence,
          key: sequenceKey,
        });
        return { expectedSequence, status: "deferred" };
      }

      const claimed = await transaction.claimInbox({
        consumer: this.#consumer,
        event_id: event.event_id,
      });
      if (!claimed) {
        return { status: "duplicate" };
      }
      if (deliveredSequence < expected) {
        return { expectedSequence, status: "stale" };
      }

      await this.#handler(transaction, event);
      const nextExpectedSequence = (deliveredSequence + 1n).toString();
      const advanced = await transaction.advanceSequence(
        sequenceKey,
        expectedSequence,
        nextExpectedSequence,
      );
      if (!advanced) {
        throw new SequenceConflictError();
      }
      await transaction.scheduleDeferredWakeup({
        expectedSequence: nextExpectedSequence,
        key: sequenceKey,
      });
      return { status: "processed" };
    });
  }

  async #deliverWithoutRecovery(event: Event): Promise<DeliveryResult> {
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      let result: DeliveryAttemptResult;
      try {
        result = await this.#attemptDelivery(event);
      } catch (error) {
        if (attempt === this.#maxAttempts) {
          await this.#dlq.put({
            attempts: attempt,
            consumer: this.#consumer,
            event,
            lastError: error instanceof Error ? error.message : String(error),
          });
          return { attempts: attempt, status: "dead-lettered" };
        }
        continue;
      }

      if (result.status === "deferred") {
        return { ...result, attempts: 0 };
      }
      return { ...result, attempts: attempt };
    }

    throw new RangeError("maxAttempts must be a positive integer");
  }

  async recoverDeferred(
    limit = this.#deferredBatchSize,
  ): Promise<DeferredRecoveryResult> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("deferred recovery limit must be a positive integer");
    }

    const claims = await this.#deferred.claimReadyBatch({
      consumer: this.#consumer,
      leaseDurationMs: this.#deferredLeaseDurationMs,
      leaseOwner: this.#deferredLeaseOwner,
      limit,
    });
    const outstandingClaims = new Set(claims);
    let completed = 0;
    let released = 0;
    try {
      if (claims.length > limit) {
        throw new Error("Deferred adapter exceeded the requested batch limit");
      }
      for (const claim of claims) {
        const result = await this.#deliverWithoutRecovery(claim.event);

        if (result.status === "deferred") {
          await this.#deferred.releaseClaim(claim);
          outstandingClaims.delete(claim);
          released += 1;
          continue;
        }

        await this.#deferred.completeClaim(claim);
        outstandingClaims.delete(claim);
        completed += 1;
      }
    } catch (error) {
      const releaseErrors: unknown[] = [];
      for (const claim of outstandingClaims) {
        try {
          await this.#deferred.releaseClaim(claim);
        } catch (releaseError) {
          releaseErrors.push(releaseError);
        }
      }
      if (releaseErrors.length > 0) {
        throw new AggregateError(
          [error, ...releaseErrors],
          "Deferred recovery failed and outstanding claims could not all be released",
          { cause: error },
        );
      }
      throw error;
    }

    return { claimed: claims.length, completed, released };
  }

  async deliver(event: Event): Promise<DeliveryResult> {
    const result = await this.#deliverWithoutRecovery(event);
    if (
      result.status === "duplicate" ||
      result.status === "processed" ||
      result.status === "stale"
    ) {
      const recovery = await this.recoverDeferred();
      if (recovery.completed > 0) this.#requestSweep();
    }
    return result;
  }

  async replay(eventId: string): Promise<ReplayResult> {
    const entry = await this.#dlq.get(this.#consumer, eventId);
    if (entry === undefined) {
      return { attempts: 0, status: "not-found" };
    }

    const result = await this.deliver(entry.event);
    if (
      result.status !== "dead-lettered" &&
      result.status !== "deferred"
    ) {
      await this.#dlq.remove(this.#consumer, eventId);
    }
    return result;
  }
}
