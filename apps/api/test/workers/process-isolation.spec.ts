import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { activeTcpServerCount } from "../../src/runtime/process-ready.js";
import type {
  ShutdownSignal,
  ShutdownSignalSource,
} from "../../src/runtime/shutdown-signal.js";
import {
  ConsumerRunner,
  type ConsumerTransaction,
} from "../../src/workers/consumer-runner.js";
import { ConsumerRegistry } from "../../src/workers/consumer-registry.js";
import { InMemoryDlqStore } from "../../src/workers/dlq-store.js";
import { createEventsWorker } from "../../src/workers/events.main.js";
import { createMarketWorker } from "../../src/workers/market.main.js";
import { runWorkerProcess } from "../../src/workers/run-worker-process.js";
import {
  type WorkerComponent,
  WorkerRuntime,
} from "../../src/workers/worker-runtime.js";

type SyntheticEvent = Readonly<{
  aggregate_id: string;
  aggregate_type: string;
  event_id: string;
  sequence: string;
}>;

interface ConsumerState {
  effects: string[];
  expected: Map<string, string>;
  inbox: Set<string>;
}

const key = (...parts: readonly string[]): string => JSON.stringify(parts);

class Transaction implements ConsumerTransaction {
  constructor(readonly state: ConsumerState) {}

  acquireAggregateLock(): void {
    return undefined;
  }

  claimInbox(receipt: {
    readonly consumer: string;
    readonly event_id: string;
  }): boolean {
    const receiptKey = key(receipt.consumer, receipt.event_id);
    if (this.state.inbox.has(receiptKey)) return false;
    this.state.inbox.add(receiptKey);
    return true;
  }

  deferDelivery(): void {
    return undefined;
  }

  expectedSequence(sequenceKey: {
    readonly aggregate_id: string;
    readonly aggregate_type: string;
    readonly consumer: string;
  }): string {
    return (
      this.state.expected.get(
        key(
          sequenceKey.consumer,
          sequenceKey.aggregate_type,
          sequenceKey.aggregate_id,
        ),
      ) ?? "1"
    );
  }

  advanceSequence(
    sequenceKey: {
      readonly aggregate_id: string;
      readonly aggregate_type: string;
      readonly consumer: string;
    },
    expectedOrNextSequence: string,
    nextSequence?: string,
  ): boolean {
    const expectedSequence =
      nextSequence === undefined ? undefined : expectedOrNextSequence;
    const nextExpectedSequence = nextSequence ?? expectedOrNextSequence;
    if (
      expectedSequence !== undefined &&
      this.expectedSequence(sequenceKey) !== expectedSequence
    ) {
      return false;
    }
    this.state.expected.set(
      key(
        sequenceKey.consumer,
        sequenceKey.aggregate_type,
        sequenceKey.aggregate_id,
      ),
      nextExpectedSequence,
    );
    return true;
  }

  scheduleDeferredWakeup(): void {
    return undefined;
  }
}

class UnitOfWork {
  #state: ConsumerState = {
    effects: [],
    expected: new Map(),
    inbox: new Set(),
  };

  get effects(): readonly string[] {
    return [...this.#state.effects];
  }

  async transaction<Result>(
    work: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result> {
    const draft = structuredClone(this.#state);
    const result = await work(new Transaction(draft));
    this.#state = draft;
    return result;
  }
}

class LatchingSignalSource implements ShutdownSignalSource {
  readonly #latched = new Set<ShutdownSignal>();
  readonly #listeners = new Map<ShutdownSignal, Set<() => void>>();

  emit(signal: ShutdownSignal): void {
    this.#latched.add(signal);
    for (const listener of this.#listeners.get(signal) ?? []) {
      this.off(signal, listener);
      listener();
    }
  }

  listenerCount(): number {
    return [...this.#listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }

  off(signal: ShutdownSignal, listener: () => void): void {
    this.#listeners.get(signal)?.delete(listener);
  }

  once(signal: ShutdownSignal, listener: () => void): void {
    if (this.#latched.has(signal)) {
      queueMicrotask(listener);
      return;
    }
    const listeners = this.#listeners.get(signal) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(signal, listeners);
  }
}

const event: SyntheticEvent = {
  aggregate_id: "post_1",
  aggregate_type: "post",
  event_id: "00000000-0000-4000-8000-000000000001",
  sequence: "1",
};

type WorkerReadyRecord = Readonly<{
  adapterMode: unknown;
  components: unknown;
  consumer: unknown;
  durable: unknown;
  event: unknown;
}>;

const waitForWorkerReadyRecord = async (
  child: ReturnType<typeof spawn>,
): Promise<WorkerReadyRecord> =>
  await new Promise((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for synthetic worker readiness"));
    }, 5_000);
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout?.off("data", onData);
      child.off("exit", onExit);
    };
    const onData = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/u);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as WorkerReadyRecord;
          if (record.event === "worker.ready") {
            cleanup();
            resolve(record);
            return;
          }
        } catch {
          // Ignore bounded non-JSON process diagnostics.
        }
      }
    };
    const onExit = (): void => {
      cleanup();
      reject(new Error("Worker exited before readiness"));
    };
    child.stdout?.on("data", onData);
    child.once("exit", onExit);
  });

const spawnEventsEntrypoint = (
  environment: Readonly<Record<string, string>>,
): ReturnType<typeof spawn> => {
  const applicationDirectory = fileURLToPath(new URL("../..", import.meta.url));
  const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  return spawn(process.execPath, [tsxCli, "src/workers/events.main.ts"], {
    cwd: applicationDirectory,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
};

const createRunner = (unitOfWork: UnitOfWork) =>
  new ConsumerRunner({
    consumer: "feed-projector",
    deferred: {
      claimReadyBatch: () => [],
      completeClaim: () => undefined,
      releaseClaim: () => undefined,
    },
    dlq: new InMemoryDlqStore<SyntheticEvent>(),
    handler: (transaction: Transaction, delivered: SyntheticEvent) => {
      transaction.state.effects.push(`feed:${delivered.event_id}`);
    },
    maxAttempts: 3,
    unitOfWork,
  });

describe("worker process isolation", () => {
  it("labels local synthetic readiness as non-durable with its actual components", async () => {
    const child = spawnEventsEntrypoint({
      APP_ENV: "local",
      NODE_ENV: "production",
    });
    const exit = once(child, "exit");

    try {
      await expect(waitForWorkerReadyRecord(child)).resolves.toMatchObject({
        adapterMode: "local-synthetic",
        components: ["inbox-consumer", "outbox-dispatcher"],
        consumer: "events",
        durable: false,
        event: "worker.ready",
      });
      expect(child.kill("SIGTERM")).toBe(true);
      await expect(exit).resolves.toEqual([0, null]);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exit;
      }
    }
  });

  it("fails a production worker closed without emitting readiness when adapters are missing", async () => {
    const child = spawnEventsEntrypoint({
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    let standardError = "";
    let standardOutput = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      standardError += chunk.toString("utf8");
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString("utf8");
    });

    const [code, signal] = await once(child, "exit", {
      signal: AbortSignal.timeout(5_000),
    });

    expect({ code, signal }).toEqual({ code: 1, signal: null });
    expect(standardOutput).not.toContain('"event":"worker.ready"');
    expect(standardError).toContain('"event":"worker.failed"');
  });

  it("starts events and market duties without opening a TCP listener", async () => {
    const registry = new ConsumerRegistry();
    const tcpServersBefore = activeTcpServerCount();
    const events = createEventsWorker({ registry });
    const market = createMarketWorker({ registry });

    try {
      await events.start();
      await market.start();

      expect(registry.activeConsumers()).toEqual(["events", "market"]);
      expect(activeTcpServerCount()).toBe(tcpServersBefore);
    } finally {
      await events.stop();
      await market.stop();
    }
  });

  it("restarts the events process without repeating a committed Inbox side effect", async () => {
    const registry = new ConsumerRegistry();
    const unitOfWork = new UnitOfWork();
    const firstRunner = createRunner(unitOfWork);
    const firstWorker = createEventsWorker({
      components: { "inbox-consumer": firstRunner },
      registry,
    });

    await firstWorker.start();
    await expect(firstRunner.deliver(event)).resolves.toMatchObject({
      status: "processed",
    });
    await firstWorker.stop();

    const restartedRunner = createRunner(unitOfWork);
    const restartedWorker = createEventsWorker({
      components: { "inbox-consumer": restartedRunner },
      registry,
    });
    await restartedWorker.start();
    await expect(restartedRunner.deliver(event)).resolves.toMatchObject({
      status: "duplicate",
    });
    await restartedWorker.stop();

    expect(unitOfWork.effects).toEqual([`feed:${event.event_id}`]);
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("captures shutdown signals during startup and closes the completed runtime", async () => {
    const calls: string[] = [];
    const component: WorkerComponent = {
      name: "telemetry",
      start: () => {
        calls.push("start:telemetry");
      },
      stop: () => {
        calls.push("stop:telemetry");
      },
    };
    const source = new LatchingSignalSource();
    const registry = new ConsumerRegistry();
    const runtime = new WorkerRuntime("events", registry, [component]);
    let readyCalls = 0;
    let releaseStartup = (): void => undefined;
    const startupGate = new Promise<void>((resolve) => {
      releaseStartup = resolve;
    });
    const running = runWorkerProcess(
      async () => {
        await startupGate;
        await runtime.start();
        return runtime;
      },
      {
        onReady: () => {
          readyCalls += 1;
        },
        signalSource: source,
      },
    );

    await Promise.resolve();
    const listenersDuringStartup = source.listenerCount();
    source.emit("SIGTERM");
    releaseStartup();
    await running;

    expect(listenersDuringStartup).toBe(2);
    expect(readyCalls).toBe(0);
    expect(calls).toEqual(["start:telemetry", "stop:telemetry"]);
    expect(registry.activeConsumers()).toEqual([]);
  });
});
