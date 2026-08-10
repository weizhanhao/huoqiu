import { describe, expect, it, vi } from "vitest";

import { ConsumerRunner } from "../../src/workers/consumer-runner.js";
import { InMemoryDlqStore } from "../../src/workers/dlq-store.js";
import {
  executeBusinessWithOutbox,
  OutboxDispatcher,
} from "../../src/workers/outbox-dispatcher.js";

type SyntheticEvent = Readonly<{
  aggregate_id: string;
  aggregate_type: string;
  event_id: string;
  payload: Readonly<Record<string, unknown>>;
  sequence: string;
}>;

interface TransactionState {
  businessWrites: string[];
  outbox: SyntheticEvent[];
}

interface BusinessTransaction {
  readonly businessWrites: string[];
  appendOutbox(event: SyntheticEvent): void;
}

class AtomicMemoryStore {
  readonly #state: TransactionState = {
    businessWrites: [],
    outbox: [],
  };
  appendAttempts = 0;
  failOutboxAppend = false;

  get state(): Readonly<TransactionState> {
    return structuredClone(this.#state);
  }

  async transaction<Result>(
    work: (transaction: BusinessTransaction) => Promise<Result>,
  ): Promise<Result> {
    const draft = structuredClone(this.#state);
    const result = await work({
      appendOutbox: (outboxEvent) => {
        this.appendAttempts += 1;
        if (this.failOutboxAppend) {
          throw new Error("synthetic outbox append failed");
        }
        draft.outbox.push(outboxEvent);
      },
      businessWrites: draft.businessWrites,
    });
    this.#state.businessWrites = draft.businessWrites;
    this.#state.outbox = draft.outbox;
    return result;
  }
}

const event: SyntheticEvent = {
  aggregate_id: "post_1",
  aggregate_type: "post",
  event_id: "00000000-0000-4000-8000-000000000001",
  payload: { status: "published" },
  sequence: "1",
};

type Receipt = Readonly<{ consumer: string; event_id: string }>;
type SequenceKey = Readonly<{
  aggregate_id: string;
  aggregate_type: string;
  consumer: string;
}>;

type DeferredWakeup = Readonly<{
  expectedSequence: string;
  key: SequenceKey;
}>;

type DeferredRequest = Readonly<{
  consumer: string;
  event: SyntheticEvent;
  expectedSequence: string;
  key: SequenceKey;
}>;

interface ConsumerState {
  deferred: Map<string, DeferredRequest>;
  effects: string[];
  expectedSequences: Map<string, string>;
  inbox: Set<string>;
  wakeups: Map<string, DeferredWakeup>;
}

const compositeKey = (...parts: readonly string[]): string =>
  JSON.stringify(parts);

class ConsumerTransactionContext {
  constructor(
    readonly state: ConsumerState,
    readonly onLock: (key: SequenceKey) => void = () => undefined,
    readonly onCompareAndSwap: (
      expectedSequence: string | undefined,
      nextExpectedSequence: string,
    ) => boolean | undefined = () => undefined,
  ) {}

  acquireAggregateLock(sequenceKey: SequenceKey): void {
    this.onLock(sequenceKey);
  }

  claimInbox(receipt: Receipt): boolean {
    const key = compositeKey(receipt.consumer, receipt.event_id);
    if (this.state.inbox.has(key)) return false;
    this.state.inbox.add(key);
    return true;
  }

  deferDelivery(request: DeferredRequest): void {
    this.state.deferred.set(
      compositeKey(request.consumer, request.event.event_id),
      request,
    );
  }

  expectedSequence(key: SequenceKey): string {
    return (
      this.state.expectedSequences.get(
        compositeKey(
          key.consumer,
          key.aggregate_type,
          key.aggregate_id,
        ),
      ) ?? "1"
    );
  }

  advanceSequence(
    key: SequenceKey,
    expectedOrNextSequence: string,
    nextSequence?: string,
  ): boolean {
    const expectedSequence =
      nextSequence === undefined ? undefined : expectedOrNextSequence;
    const nextExpectedSequence = nextSequence ?? expectedOrNextSequence;
    if (
      this.onCompareAndSwap(expectedSequence, nextExpectedSequence) === false
    ) {
      return false;
    }
    if (
      expectedSequence !== undefined &&
      this.expectedSequence(key) !== expectedSequence
    ) {
      return false;
    }
    this.state.expectedSequences.set(
      compositeKey(key.consumer, key.aggregate_type, key.aggregate_id),
      nextExpectedSequence,
    );
    return true;
  }

  scheduleDeferredWakeup(wakeup: DeferredWakeup): void {
    this.state.wakeups.set(
      compositeKey(
        wakeup.key.consumer,
        wakeup.key.aggregate_type,
        wakeup.key.aggregate_id,
      ),
      wakeup,
    );
  }

  addEffect(effect: string): void {
    this.state.effects.push(effect);
  }
}

class ConsumerMemoryStore {
  #state: ConsumerState = {
    deferred: new Map(),
    effects: [],
    expectedSequences: new Map(),
    inbox: new Set(),
    wakeups: new Map(),
  };
  compareAndSwapFailuresRemaining = 0;

  get effects(): readonly string[] {
    return [...this.#state.effects];
  }

  get inboxSize(): number {
    return this.#state.inbox.size;
  }

  get wakeups(): readonly DeferredWakeup[] {
    return [...this.#state.wakeups.values()];
  }

  get deferredRequests(): readonly DeferredRequest[] {
    return [...this.#state.deferred.values()];
  }

  completeDeferred(pendingKey: string): void {
    this.#state.deferred.delete(pendingKey);
  }

  completeWakeup(wakeup: DeferredWakeup): void {
    const wakeupKey = compositeKey(
      wakeup.key.consumer,
      wakeup.key.aggregate_type,
      wakeup.key.aggregate_id,
    );
    if (
      this.#state.wakeups.get(wakeupKey)?.expectedSequence ===
      wakeup.expectedSequence
    ) {
      this.#state.wakeups.delete(wakeupKey);
    }
  }

  async transaction<Result>(
    work: (transaction: ConsumerTransactionContext) => Promise<Result>,
  ): Promise<Result> {
    const draft = structuredClone(this.#state);
    const result = await work(
      new ConsumerTransactionContext(
        draft,
        () => undefined,
        () => {
          if (this.compareAndSwapFailuresRemaining === 0) return undefined;
          this.compareAndSwapFailuresRemaining -= 1;
          return false;
        },
      ),
    );
    this.#state = draft;
    return result;
  }
}

type DeferredClaim = Readonly<{
  claimId: string;
  event: SyntheticEvent;
  leaseExpiresAt: number;
  leaseOwner: string;
}>;

interface WakeupStore {
  readonly deferredRequests: readonly DeferredRequest[];
  readonly wakeups: readonly DeferredWakeup[];
  completeDeferred(pendingKey: string): void;
  completeWakeup(wakeup: DeferredWakeup): void;
}

class DeferredMemory {
  readonly #claims = new Map<
    string,
    Readonly<{
      expiresAt: number;
      leaseOwner: string;
      pendingKey: string;
      wakeup: DeferredWakeup;
    }>
  >();
  readonly #wakeupStore: WakeupStore;
  #nowMilliseconds = 0;
  failClaimAttempts = 0;
  failCompleteAttempts = 0;
  pauseClaims = false;

  constructor(wakeupStore: WakeupStore) {
    this.#wakeupStore = wakeupStore;
  }

  get size(): number {
    return this.#wakeupStore.deferredRequests.length;
  }

  get claimedSize(): number {
    return this.#claims.size;
  }

  advanceClock(milliseconds: number): void {
    this.#nowMilliseconds += milliseconds;
  }

  claimReadyBatch(request: {
    readonly consumer: string;
    readonly leaseDurationMs: number;
    readonly leaseOwner: string;
    readonly limit: number;
  }): readonly DeferredClaim[] {
    if (this.failClaimAttempts > 0) {
      this.failClaimAttempts -= 1;
      throw new Error("synthetic deferred sweep unavailable");
    }
    if (this.pauseClaims) return [];

    for (const [claimId, claim] of this.#claims) {
      if (claim.expiresAt <= this.#nowMilliseconds) {
        this.#claims.delete(claimId);
      }
    }

    const claims: DeferredClaim[] = [];
    for (const wakeup of this.#wakeupStore.wakeups) {
      if (wakeup.key.consumer !== request.consumer) continue;
      const pending = this.#wakeupStore.deferredRequests.find(
        (candidate) =>
          candidate.key.aggregate_id === wakeup.key.aggregate_id &&
          candidate.key.aggregate_type === wakeup.key.aggregate_type &&
          candidate.key.consumer === wakeup.key.consumer &&
          BigInt(candidate.event.sequence) <= BigInt(wakeup.expectedSequence),
      );
      if (pending === undefined) {
        this.#wakeupStore.completeWakeup(wakeup);
        continue;
      }
      const pendingKey = compositeKey(
        pending.consumer,
        pending.event.event_id,
      );
      if (this.#claims.has(pendingKey)) continue;
      const expiresAt = this.#nowMilliseconds + request.leaseDurationMs;
      this.#claims.set(pendingKey, {
        expiresAt,
        leaseOwner: request.leaseOwner,
        pendingKey,
        wakeup,
      });
      claims.push({
        claimId: pendingKey,
        event: pending.event,
        leaseExpiresAt: expiresAt,
        leaseOwner: request.leaseOwner,
      });
      if (claims.length === request.limit) break;
    }
    return claims;
  }

  completeClaim(claim: DeferredClaim): void {
    const storedClaim = this.#claims.get(claim.claimId);
    if (storedClaim?.leaseOwner !== claim.leaseOwner) {
      throw new Error("synthetic deferred claim owner mismatch");
    }
    if (this.failCompleteAttempts > 0) {
      this.failCompleteAttempts -= 1;
      throw new Error("synthetic deferred completion unavailable");
    }
    this.#wakeupStore.completeDeferred(storedClaim.pendingKey);
    this.#claims.delete(claim.claimId);
    const currentWakeup = this.#wakeupStore.wakeups.find(
      (wakeup) =>
        wakeup.key.aggregate_id === storedClaim.wakeup.key.aggregate_id &&
        wakeup.key.aggregate_type === storedClaim.wakeup.key.aggregate_type &&
        wakeup.key.consumer === storedClaim.wakeup.key.consumer,
    );
    const stillReady =
      currentWakeup !== undefined &&
      this.#wakeupStore.deferredRequests.some(
        (pending) =>
          pending.key.aggregate_id === currentWakeup.key.aggregate_id &&
          pending.key.aggregate_type === currentWakeup.key.aggregate_type &&
          pending.key.consumer === currentWakeup.key.consumer &&
          BigInt(pending.event.sequence) <=
            BigInt(currentWakeup.expectedSequence),
      );
    if (currentWakeup !== undefined && !stillReady) {
      this.#wakeupStore.completeWakeup(currentWakeup);
    }
  }

  releaseClaim(claim: DeferredClaim): void {
    const storedClaim = this.#claims.get(claim.claimId);
    if (storedClaim?.leaseOwner !== claim.leaseOwner) {
      throw new Error("synthetic deferred claim owner mismatch");
    }
    this.#claims.delete(claim.claimId);
  }
}

class KeyedConsumerTransactionContext {
  readonly #deferred = new Map<string, DeferredRequest>();
  readonly #effects: string[] = [];
  readonly #expectedSequences = new Map<string, string>();
  readonly #inbox = new Set<string>();
  readonly #store: KeyedConsumerMemoryStore;
  readonly #wakeups = new Map<string, DeferredWakeup>();
  #releaseLock: (() => void) | undefined;

  constructor(store: KeyedConsumerMemoryStore) {
    this.#store = store;
  }

  async acquireAggregateLock(sequenceKey: SequenceKey): Promise<void> {
    this.#releaseLock = await this.#store.acquire(sequenceKey);
  }

  addEffect(effect: string): void {
    this.#effects.push(effect);
  }

  advanceSequence(
    key: SequenceKey,
    expectedSequence: string,
    nextExpectedSequence: string,
  ): boolean {
    this.#store.compareAndSwaps.push(
      `${expectedSequence}->${nextExpectedSequence}`,
    );
    if (this.expectedSequence(key) !== expectedSequence) return false;
    this.#expectedSequences.set(
      compositeKey(key.consumer, key.aggregate_type, key.aggregate_id),
      nextExpectedSequence,
    );
    return true;
  }

  claimInbox(receipt: Receipt): boolean {
    const receiptKey = compositeKey(receipt.consumer, receipt.event_id);
    if (this.#store.hasInbox(receiptKey) || this.#inbox.has(receiptKey)) {
      return false;
    }
    this.#inbox.add(receiptKey);
    return true;
  }

  async deferDelivery(request: DeferredRequest): Promise<void> {
    await this.#store.beforeDefer();
    this.#deferred.set(
      compositeKey(request.consumer, request.event.event_id),
      request,
    );
  }

  commit(): void {
    this.#store.commit({
      deferred: this.#deferred,
      effects: this.#effects,
      expectedSequences: this.#expectedSequences,
      inbox: this.#inbox,
      wakeups: this.#wakeups,
    });
  }

  expectedSequence(key: SequenceKey): string {
    const sequenceKey = compositeKey(
      key.consumer,
      key.aggregate_type,
      key.aggregate_id,
    );
    return (
      this.#expectedSequences.get(sequenceKey) ??
      this.#store.expectedSequence(sequenceKey)
    );
  }

  release(): void {
    this.#releaseLock?.();
    this.#releaseLock = undefined;
  }

  scheduleDeferredWakeup(wakeup: DeferredWakeup): void {
    this.#wakeups.set(
      compositeKey(
        wakeup.key.consumer,
        wakeup.key.aggregate_type,
        wakeup.key.aggregate_id,
      ),
      wakeup,
    );
  }
}

class KeyedConsumerMemoryStore {
  #state: ConsumerState = {
    deferred: new Map(),
    effects: [],
    expectedSequences: new Map(),
    inbox: new Set(),
    wakeups: new Map(),
  };
  readonly #lockTails = new Map<string, Promise<void>>();
  beforeDefer: () => Promise<void> | void = () => undefined;
  readonly compareAndSwaps: string[] = [];
  lockCalls = 0;

  get effects(): readonly string[] {
    return [...this.#state.effects];
  }

  get wakeups(): readonly DeferredWakeup[] {
    return [...this.#state.wakeups.values()];
  }

  get deferredRequests(): readonly DeferredRequest[] {
    return [...this.#state.deferred.values()];
  }

  completeDeferred(pendingKey: string): void {
    this.#state.deferred.delete(pendingKey);
  }

  completeWakeup(wakeup: DeferredWakeup): void {
    const wakeupKey = compositeKey(
      wakeup.key.consumer,
      wakeup.key.aggregate_type,
      wakeup.key.aggregate_id,
    );
    if (
      this.#state.wakeups.get(wakeupKey)?.expectedSequence ===
      wakeup.expectedSequence
    ) {
      this.#state.wakeups.delete(wakeupKey);
    }
  }

  async acquire(key: SequenceKey): Promise<() => void> {
    const lockKey = compositeKey(
      key.consumer,
      key.aggregate_type,
      key.aggregate_id,
    );
    const previous = this.#lockTails.get(lockKey) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#lockTails.set(lockKey, current);
    await previous;
    this.lockCalls += 1;
    return () => {
      release();
      if (this.#lockTails.get(lockKey) === current) {
        this.#lockTails.delete(lockKey);
      }
    };
  }

  commit(changes: ConsumerState): void {
    for (const [key, value] of changes.deferred) {
      this.#state.deferred.set(key, value);
    }
    this.#state.effects.push(...changes.effects);
    for (const [key, value] of changes.expectedSequences) {
      this.#state.expectedSequences.set(key, value);
    }
    for (const receipt of changes.inbox) this.#state.inbox.add(receipt);
    for (const [key, value] of changes.wakeups) {
      this.#state.wakeups.set(key, value);
    }
  }

  expectedSequence(sequenceKey: string): string {
    return this.#state.expectedSequences.get(sequenceKey) ?? "1";
  }

  hasInbox(receiptKey: string): boolean {
    return this.#state.inbox.has(receiptKey);
  }

  async transaction<Result>(
    work: (transaction: KeyedConsumerTransactionContext) => Promise<Result>,
  ): Promise<Result> {
    const transaction = new KeyedConsumerTransactionContext(this);
    try {
      const result = await work(transaction);
      transaction.commit();
      return result;
    } finally {
      transaction.release();
    }
  }
}

describe("business and Outbox transaction port", () => {
  it("commits the business write and Outbox event together", async () => {
    const store = new AtomicMemoryStore();

    const result = await executeBusinessWithOutbox({
      atomic: store,
      business: (transaction: BusinessTransaction) => {
        transaction.businessWrites.push("published:post_1");
        return { aggregateId: "post_1", status: "published" };
      },
      createEvent: (_transaction, businessResult) => {
        return {
          ...event,
          aggregate_id: businessResult.aggregateId,
          payload: { status: businessResult.status },
        };
      },
    });

    expect(result).toEqual({ aggregateId: "post_1", status: "published" });
    expect(store.state).toEqual({
      businessWrites: ["published:post_1"],
      outbox: [event],
    });
  });

  it("rolls the business write back when the Outbox append fails", async () => {
    const store = new AtomicMemoryStore();
    store.failOutboxAppend = true;

    await expect(
      executeBusinessWithOutbox({
        atomic: store,
        business: (transaction: BusinessTransaction) => {
          transaction.businessWrites.push("published:post_1");
        },
        createEvent: () => event,
      }),
    ).rejects.toThrow("synthetic outbox append failed");

    expect(store.state).toEqual({ businessWrites: [], outbox: [] });
  });

  it("never appends an Outbox event when the business write fails", async () => {
    const store = new AtomicMemoryStore();

    await expect(
      executeBusinessWithOutbox({
        atomic: store,
        business: (transaction: BusinessTransaction) => {
          transaction.businessWrites.push("must-roll-back");
          throw new Error("synthetic business failure");
        },
        createEvent: () => event,
      }),
    ).rejects.toThrow("synthetic business failure");

    expect(store.appendAttempts).toBe(0);
    expect(store.state).toEqual({ businessWrites: [], outbox: [] });
  });

  it("manages an injected dispatch loop as a runtime component", async () => {
    const calls: string[] = [];
    const dispatcher = new OutboxDispatcher({
      start: () => {
        calls.push("start:dispatch-loop");
      },
      stop: () => {
        calls.push("stop:dispatch-loop");
      },
    });

    expect(dispatcher.name).toBe("outbox-dispatcher");
    await dispatcher.start();
    await dispatcher.stop();
    expect(calls).toEqual(["start:dispatch-loop", "stop:dispatch-loop"]);
  });
});

describe("queryable dead-letter store", () => {
  it("keys entries by consumer and event id until explicit removal", async () => {
    const store = new InMemoryDlqStore<SyntheticEvent>();
    const entry = {
      attempts: 3,
      consumer: "feed-projector",
      event,
      lastError: "synthetic handler failure",
    };

    await store.put(entry);
    await store.put({ ...entry, attempts: 4 });

    await expect(
      store.get("feed-projector", event.event_id),
    ).resolves.toEqual({ ...entry, attempts: 4 });
    await expect(store.list()).resolves.toEqual([{ ...entry, attempts: 4 }]);
    await expect(store.remove("feed-projector", event.event_id)).resolves.toBe(
      true,
    );
    await expect(store.list()).resolves.toEqual([]);
  });
});

describe("generic Inbox consumer runner", () => {
  it("rejects retry limits that are not positive integers", () => {
    const store = new ConsumerMemoryStore();
    const create = (maxAttempts: number) =>
      new ConsumerRunner({
        consumer: "feed-projector",
        deferred: new DeferredMemory(store),
        dlq: new InMemoryDlqStore<SyntheticEvent>(),
        handler: () => undefined,
        maxAttempts,
        unitOfWork: store,
      });

    expect(() => create(0)).toThrow("maxAttempts");
    expect(() => create(1.5)).toThrow("maxAttempts");
  });

  it("deduplicates by event id and consumer inside the side-effect transaction", async () => {
    const store = new ConsumerMemoryStore();
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`feed:${delivered.event_id}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 1,
      status: "processed",
    });
    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 1,
      status: "duplicate",
    });
    expect(store.effects).toEqual([`feed:${event.event_id}`]);
    expect(store.inboxSize).toBe(1);
  });

  it("retires per-aggregate sweep hints after a long fully ordered stream", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (transaction: ConsumerTransactionContext) => {
        transaction.addEffect("ordered");
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    for (let sequence = 1; sequence <= 50; sequence += 1) {
      await runner.deliver({
        ...event,
        event_id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        sequence: String(sequence),
      });
    }

    expect(store.effects).toHaveLength(50);
    expect(store.wakeups).toEqual([]);
  });

  it("defers a sequence gap and never lets a stale event overwrite the aggregate", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000002",
      sequence: "2",
    };
    const stale = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000003",
      payload: { status: "must-not-overwrite" },
    };

    await expect(runner.deliver(second)).resolves.toEqual({
      attempts: 0,
      expectedSequence: "1",
      status: "deferred",
    });
    expect(store.effects).toEqual([]);
    expect(store.inboxSize).toBe(0);
    expect(deferred.size).toBe(1);

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 1,
      status: "processed",
    });
    expect(deferred.size).toBe(0);
    await expect(runner.deliver(stale)).resolves.toEqual({
      attempts: 1,
      expectedSequence: "3",
      status: "stale",
    });
    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
  });

  it("persists a gap under the aggregate lock before a predecessor can retire its wakeup", async () => {
    const store = new KeyedConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    let markDeferEntered = (): void => undefined;
    const deferEntered = new Promise<void>((resolve) => {
      markDeferEntered = resolve;
    });
    let releaseDefer = (): void => undefined;
    const deferGate = new Promise<void>((resolve) => {
      releaseDefer = resolve;
    });
    const blockDefer = async (): Promise<void> => {
      markDeferEntered();
      await deferGate;
    };
    store.beforeDefer = blockDefer;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: KeyedConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000054",
      sequence: "2",
    };

    const outOfOrderDelivery = runner.deliver(second);
    await deferEntered;
    const predecessorDelivery = runner.deliver(event);
    const predecessorSettledBeforeDefer = await Promise.race([
      predecessorDelivery.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 10);
      }),
    ]);

    expect(predecessorSettledBeforeDefer).toBe(false);
    releaseDefer();
    await Promise.all([outOfOrderDelivery, predecessorDelivery]);
    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(deferred.size).toBe(0);
    expect(store.wakeups).toEqual([]);
  });

  it("persists a deferred wakeup with the cursor and recovers it after a post-commit sweep failure", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const createRunner = () =>
      new ConsumerRunner({
        consumer: "feed-projector",
        deferred,
        dlq: new InMemoryDlqStore<SyntheticEvent>(),
        handler: (
          transaction: ConsumerTransactionContext,
          delivered: SyntheticEvent,
        ) => {
          transaction.addEffect(`sequence:${delivered.sequence}`);
        },
        maxAttempts: 3,
        unitOfWork: store,
      });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000022",
      sequence: "2",
    };
    const firstRunner = createRunner();

    await expect(firstRunner.deliver(second)).resolves.toMatchObject({
      status: "deferred",
    });
    deferred.failClaimAttempts = 1;
    await expect(firstRunner.deliver(event)).rejects.toThrow(
      "synthetic deferred sweep unavailable",
    );
    expect(store.effects).toEqual(["sequence:1"]);
    expect(store.wakeups).toHaveLength(1);
    expect(deferred.size).toBe(1);

    const restartedRunner = createRunner();
    await restartedRunner.start();
    await restartedRunner.stop();

    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(store.wakeups).toEqual([]);
    expect(deferred.size).toBe(0);
  });

  it("takes over an expired deferred lease after the claiming worker crashes", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const createRunner = () =>
      new ConsumerRunner({
        consumer: "feed-projector",
        deferred,
        deferredLeaseDurationMs: 30,
        deferredSweepIntervalMs: 5,
        dlq: new InMemoryDlqStore<SyntheticEvent>(),
        handler: (
          transaction: ConsumerTransactionContext,
          delivered: SyntheticEvent,
        ) => {
          transaction.addEffect(`sequence:${delivered.sequence}`);
        },
        maxAttempts: 3,
        unitOfWork: store,
      });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000053",
      sequence: "2",
    };
    const firstRunner = createRunner();

    await firstRunner.deliver(second);
    deferred.failClaimAttempts = 1;
    await expect(firstRunner.deliver(event)).rejects.toThrow(
      "synthetic deferred sweep unavailable",
    );
    expect(
      deferred.claimReadyBatch({
        consumer: "feed-projector",
        leaseDurationMs: 30,
        leaseOwner: "crashed-worker",
        limit: 1,
      }),
    ).toHaveLength(1);
    expect(deferred.claimedSize).toBe(1);

    deferred.advanceClock(31);
    const restartedRunner = createRunner();
    await restartedRunner.start();
    await restartedRunner.stop();

    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(deferred.size).toBe(0);
    expect(deferred.claimedSize).toBe(0);
  });

  it("retries a durable deferred sweep on duplicate delivery without reapplying the committed event", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000023",
      sequence: "2",
    };

    await runner.deliver(second);
    deferred.failClaimAttempts = 1;
    await expect(runner.deliver(event)).rejects.toThrow(
      "synthetic deferred sweep unavailable",
    );
    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 1,
      status: "duplicate",
    });

    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(deferred.size).toBe(0);
  });

  it("releases a failed completion claim so recovery never loses the deferred record", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000027",
      sequence: "2",
    };

    await runner.deliver(second);
    deferred.failCompleteAttempts = 1;
    await expect(runner.deliver(event)).rejects.toThrow(
      "synthetic deferred completion unavailable",
    );
    expect(deferred.size).toBe(1);

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 1,
      status: "duplicate",
    });
    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(deferred.size).toBe(0);
  });

  it("releases every outstanding claim when the first record in a batch fails", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    deferred.pauseClaims = true;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      deferredBatchSize: 3,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(
          `${delivered.aggregate_id}:${delivered.sequence}`,
        );
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const firstEvents = ["post_1", "post_2", "post_3"].map(
      (aggregateId, index) => ({
        ...event,
        aggregate_id: aggregateId,
        event_id: `00000000-0000-4000-8000-00000000003${String(index)}`,
      }),
    );
    const secondEvents = firstEvents.map((first, index) => ({
      ...first,
      event_id: `00000000-0000-4000-8000-00000000004${String(index)}`,
      sequence: "2",
    }));

    for (const secondEvent of secondEvents) await runner.deliver(secondEvent);
    for (const firstEvent of firstEvents) await runner.deliver(firstEvent);
    deferred.pauseClaims = false;
    deferred.failCompleteAttempts = 1;

    await expect(runner.recoverDeferred(3)).rejects.toThrow(
      "synthetic deferred completion unavailable",
    );
    expect(deferred.claimedSize).toBe(0);
    expect(deferred.size).toBe(3);

    await runner.recoverDeferred(3);
    await runner.recoverDeferred(3);
    expect(deferred.size).toBe(0);
    expect(store.effects).toEqual([
      "post_1:1",
      "post_2:1",
      "post_3:1",
      "post_1:2",
      "post_2:2",
      "post_3:2",
    ]);
  });

  it("drains only a bounded deferred batch and never recursively consumes a sequence chain", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      deferredBatchSize: 1,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000024",
      sequence: "2",
    };
    const third = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000025",
      sequence: "3",
    };

    await runner.deliver(third);
    await runner.deliver(second);
    await expect(runner.deliver(event)).resolves.toMatchObject({
      status: "processed",
    });

    expect(store.effects).toEqual(["sequence:1", "sequence:2"]);
    expect(deferred.size).toBe(1);
    await expect(runner.recoverDeferred()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      released: 0,
    });
    expect(store.effects).toEqual([
      "sequence:1",
      "sequence:2",
      "sequence:3",
    ]);
    expect(deferred.size).toBe(0);
  });

  it("continues bounded sweeps in a stop-aware background loop until a ready chain is drained", async () => {
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    deferred.pauseClaims = true;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      deferredBatchSize: 1,
      deferredSweepIntervalMs: 5,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`sequence:${delivered.sequence}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000051",
      sequence: "2",
    };
    const third = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000052",
      sequence: "3",
    };

    await runner.deliver(third);
    await runner.deliver(second);
    await runner.deliver(event);
    deferred.pauseClaims = false;

    await runner.start();
    try {
      await vi.waitFor(() => {
        expect(deferred.size).toBe(0);
      });
    } finally {
      await runner.stop();
    }

    expect(store.effects).toEqual([
      "sequence:1",
      "sequence:2",
      "sequence:3",
    ]);
  });

  it("locks the aggregate and compare-and-swaps its sequence under concurrent delivery", async () => {
    const store = new KeyedConsumerMemoryStore();
    let handlerCalls = 0;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: KeyedConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        handlerCalls += 1;
        transaction.addEffect(`winner:${delivered.event_id}`);
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const competitor = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000004",
    };

    const results = await Promise.all([
      runner.deliver(event),
      runner.deliver(competitor),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "processed",
      "stale",
    ]);
    expect(handlerCalls).toBe(1);
    expect(store.effects).toHaveLength(1);
    expect(store.lockCalls).toBe(2);
    expect(store.compareAndSwaps).toEqual(["1->2"]);
  });

  it("allows different aggregates to run concurrently while retaining keyed locking", async () => {
    const store = new KeyedConsumerMemoryStore();
    let activeHandlers = 0;
    let maximumActiveHandlers = 0;
    let releaseHandlers = (): void => undefined;
    const handlersEntered = new Promise<void>((resolve) => {
      releaseHandlers = resolve;
    });
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: async (transaction: KeyedConsumerTransactionContext) => {
        activeHandlers += 1;
        maximumActiveHandlers = Math.max(
          maximumActiveHandlers,
          activeHandlers,
        );
        if (activeHandlers === 2) releaseHandlers();
        await handlersEntered;
        transaction.addEffect("parallel-aggregate");
        activeHandlers -= 1;
      },
      maxAttempts: 3,
      unitOfWork: store,
    });
    const otherAggregate = {
      ...event,
      aggregate_id: "post_2",
      event_id: "00000000-0000-4000-8000-000000000026",
    };

    const results = await Promise.all([
      runner.deliver(event),
      runner.deliver(otherAggregate),
    ]);

    expect(results).toEqual([
      { attempts: 1, status: "processed" },
      { attempts: 1, status: "processed" },
    ]);
    expect(maximumActiveHandlers).toBe(2);
    expect(store.effects).toEqual([
      "parallel-aggregate",
      "parallel-aggregate",
    ]);
    expect(store.lockCalls).toBe(2);
  });

  it("rolls the Inbox and handler effect back after a compare-and-swap conflict, then retries safely", async () => {
    const store = new ConsumerMemoryStore();
    store.compareAndSwapFailuresRemaining = 1;
    let handlerCalls = 0;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (transaction: ConsumerTransactionContext) => {
        handlerCalls += 1;
        transaction.addEffect("committed-once-after-cas-retry");
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 2,
      status: "processed",
    });
    expect(handlerCalls).toBe(2);
    expect(store.effects).toEqual(["committed-once-after-cas-retry"]);
    expect(store.inboxSize).toBe(1);
  });

  it("does not retry a committed event when the independent recovery scan fails", async () => {
    const store = new ConsumerMemoryStore();
    let handlerCalls = 0;
    const dlq = new InMemoryDlqStore<SyntheticEvent>();
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: {
        claimReadyBatch: () => {
          throw new Error("deferred recovery scan failed");
        },
        completeClaim: () => undefined,
        releaseClaim: () => undefined,
      },
      dlq,
      handler: (transaction: ConsumerTransactionContext) => {
        handlerCalls += 1;
        transaction.addEffect("committed-once");
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    await expect(runner.deliver(event)).rejects.toThrow(
      "deferred recovery scan failed",
    );
    expect(handlerCalls).toBe(1);
    expect(store.effects).toEqual(["committed-once"]);
    await expect(dlq.list()).resolves.toEqual([]);
  });

  it("moves a repeatedly failing event to a queryable DLQ after bounded attempts", async () => {
    const store = new ConsumerMemoryStore();
    const dlq = new InMemoryDlqStore<SyntheticEvent>();
    let handlerAttempts = 0;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq,
      handler: (transaction: ConsumerTransactionContext) => {
        handlerAttempts += 1;
        transaction.addEffect("must-roll-back-before-dlq");
        throw new Error("synthetic projection failed");
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 3,
      status: "dead-lettered",
    });
    expect(handlerAttempts).toBe(3);
    expect(store.effects).toEqual([]);
    expect(store.inboxSize).toBe(0);
    await expect(dlq.get("feed-projector", event.event_id)).resolves.toEqual({
      attempts: 3,
      consumer: "feed-projector",
      event,
      lastError: "synthetic projection failed",
    });
  });

  it("replays explicitly from the DLQ and applies the side effect only once", async () => {
    const store = new ConsumerMemoryStore();
    const dlq = new InMemoryDlqStore<SyntheticEvent>();
    let fail = true;
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred: new DeferredMemory(store),
      dlq,
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        if (fail) throw new Error("temporary projection failure");
        transaction.addEffect(`feed:${delivered.event_id}`);
      },
      maxAttempts: 2,
      unitOfWork: store,
    });

    await expect(runner.deliver(event)).resolves.toEqual({
      attempts: 2,
      status: "dead-lettered",
    });
    fail = false;

    await expect(runner.replay(event.event_id)).resolves.toEqual({
      attempts: 1,
      status: "processed",
    });
    await expect(runner.replay(event.event_id)).resolves.toEqual({
      attempts: 0,
      status: "not-found",
    });
    expect(store.effects).toEqual([`feed:${event.event_id}`]);
    expect(store.inboxSize).toBe(1);
    await expect(dlq.list()).resolves.toEqual([]);
  });

  it("binds an injected intake port to delivery and stops intake cleanly", async () => {
    const calls: string[] = [];
    let intakeDelivery:
      | ((delivered: SyntheticEvent) => Promise<unknown>)
      | undefined;
    const store = new ConsumerMemoryStore();
    const deferred = new DeferredMemory(store);
    const runner = new ConsumerRunner({
      consumer: "feed-projector",
      deferred,
      dlq: new InMemoryDlqStore<SyntheticEvent>(),
      handler: (
        transaction: ConsumerTransactionContext,
        delivered: SyntheticEvent,
      ) => {
        transaction.addEffect(`feed:${delivered.event_id}`);
      },
      intake: {
        start: (
          deliver: (delivered: SyntheticEvent) => Promise<unknown>,
        ) => {
          calls.push("start:intake");
          intakeDelivery = deliver;
        },
        stop: () => {
          calls.push("stop:intake");
        },
      },
      maxAttempts: 3,
      unitOfWork: store,
    });

    expect(runner.name).toBe("inbox-consumer");
    await runner.start();
    expect(intakeDelivery).toBeTypeOf("function");
    const second = {
      ...event,
      event_id: "00000000-0000-4000-8000-000000000002",
      sequence: "2",
    };
    await expect(intakeDelivery?.(second)).resolves.toEqual({
      action: "defer",
      result: {
        attempts: 0,
        expectedSequence: "1",
        status: "deferred",
      },
    });
    await expect(intakeDelivery?.(event)).resolves.toEqual({
      action: "ack",
      result: { attempts: 1, status: "processed" },
    });
    await runner.stop();

    expect(calls).toEqual(["start:intake", "stop:intake"]);
    expect(store.effects).toEqual([
      `feed:${event.event_id}`,
      `feed:${second.event_id}`,
    ]);
    expect(deferred.size).toBe(0);
  });
});
