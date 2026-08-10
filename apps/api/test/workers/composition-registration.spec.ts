import { describe, expect, it } from "vitest";

import { ConsumerRegistry } from "../../src/workers/consumer-registry.js";
import { createEventsWorker } from "../../src/workers/events.main.js";
import { createMarketWorker } from "../../src/workers/market.main.js";
import {
  type WorkerComponent,
  WorkerRuntime,
} from "../../src/workers/worker-runtime.js";
import {
  createRegisteredWorker,
  defaultWorkerAdapterMode,
  processRegistrations,
} from "../../src/workers/worker-registry.js";

const recordingComponent = (
  name: string,
  calls: string[],
): WorkerComponent => ({
  name,
  start: () => {
    calls.push(`start:${name}`);
  },
  stop: () => {
    calls.push(`stop:${name}`);
  },
});

describe("worker composition lifecycle", () => {
  it("starts in dependency order, stops every component in reverse, and restarts", async () => {
    const calls: string[] = [];
    const components = [
      recordingComponent("telemetry", calls),
      recordingComponent("database", calls),
      recordingComponent("queue", calls),
      recordingComponent("inbox-consumer", calls),
      recordingComponent("outbox-dispatcher", calls),
    ];
    const registry = new ConsumerRegistry();
    const worker = new WorkerRuntime("events", registry, components);

    await worker.start();
    await worker.stop();
    await worker.start();
    await worker.stop();

    expect(calls).toEqual([
      "start:telemetry",
      "start:database",
      "start:queue",
      "start:inbox-consumer",
      "start:outbox-dispatcher",
      "stop:outbox-dispatcher",
      "stop:inbox-consumer",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
      "start:telemetry",
      "start:database",
      "start:queue",
      "start:inbox-consumer",
      "start:outbox-dispatcher",
      "stop:outbox-dispatcher",
      "stop:inbox-consumer",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
    ]);
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("rolls back started components and registration when startup fails", async () => {
    const calls: string[] = [];
    const registry = new ConsumerRegistry();
    const worker = new WorkerRuntime("events", registry, [
      recordingComponent("telemetry", calls),
      {
        name: "database",
        start: () => {
          calls.push("start:database");
          throw new Error("database start failed");
        },
        stop: () => {
          calls.push("stop:database");
        },
      },
    ]);

    await expect(worker.start()).rejects.toThrow("database start failed");

    expect(calls).toEqual([
      "start:telemetry",
      "start:database",
      "stop:database",
      "stop:telemetry",
    ]);
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("keeps rolling startup back when one rollback stop also fails", async () => {
    const calls: string[] = [];
    const registry = new ConsumerRegistry();
    const worker = new WorkerRuntime("events", registry, [
      recordingComponent("telemetry", calls),
      {
        name: "database",
        start: () => {
          calls.push("start:database");
        },
        stop: () => {
          calls.push("stop:database");
          throw new Error("database rollback failed");
        },
      },
      {
        name: "queue",
        start: () => {
          calls.push("start:queue");
          throw new Error("queue start failed");
        },
        stop: () => {
          calls.push("stop:queue");
        },
      },
    ]);

    const error = await worker.start().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AggregateError);
    expect(
      (error as AggregateError).errors.map((failure) =>
        failure instanceof Error ? failure.message : String(failure),
      ),
    ).toEqual(["queue start failed", "database rollback failed"]);
    expect(calls).toEqual([
      "start:telemetry",
      "start:database",
      "start:queue",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
    ]);
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("attempts every shutdown and remains restartable after one stop fails", async () => {
    const calls: string[] = [];
    let databaseStopFails = true;
    const registry = new ConsumerRegistry();
    const worker = new WorkerRuntime("events", registry, [
      recordingComponent("telemetry", calls),
      {
        name: "database",
        start: () => {
          calls.push("start:database");
        },
        stop: () => {
          calls.push("stop:database");
          if (databaseStopFails) {
            databaseStopFails = false;
            throw new Error("database stop failed");
          }
        },
      },
      recordingComponent("queue", calls),
    ]);

    await worker.start();
    const error = await worker.stop().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "database stop failed" }),
    ]);
    expect(calls).toEqual([
      "start:telemetry",
      "start:database",
      "start:queue",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
    ]);
    expect(registry.activeConsumers()).toEqual([]);

    await worker.start();
    await worker.stop();
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("linearizes overlapping start and stop transitions", async () => {
    const calls: string[] = [];
    let releaseComponentStart = (): void => undefined;
    const componentStartGate = new Promise<void>((resolve) => {
      releaseComponentStart = resolve;
    });
    const registry = new ConsumerRegistry();
    const worker = new WorkerRuntime("events", registry, [
      {
        name: "queue",
        start: async () => {
          calls.push("start:queue");
          await componentStartGate;
        },
        stop: () => {
          calls.push("stop:queue");
        },
      },
    ]);

    const firstStart = worker.start();
    const repeatedStart = worker.start();
    const firstStop = worker.stop();
    const repeatedStop = worker.stop();
    await Promise.resolve();
    releaseComponentStart();
    await Promise.all([
      firstStart,
      repeatedStart,
      firstStop,
      repeatedStop,
    ]);
    const callsAfterTransitions = [...calls];
    const activeAfterTransitions = registry.activeConsumers();
    await worker.stop();

    expect(callsAfterTransitions).toEqual(["start:queue", "stop:queue"]);
    expect(activeAfterTransitions).toEqual([]);
  });
});

describe("process composition registry", () => {
  it("declares the exact and disjoint HTTP, events, and market responsibilities", () => {
    expect(processRegistrations).toEqual({
      http: {
        process: "http",
        responsibilities: ["http-api"],
      },
      events: {
        process: "events",
        responsibilities: ["inbox-consumer", "outbox-dispatcher"],
      },
      market: {
        process: "market",
        responsibilities: ["synthetic-market-ingest"],
      },
    });
    expect(
      new Set(
        Object.values(processRegistrations).flatMap(
          (registration) => registration.responsibilities,
        ),
      ).size,
    ).toBe(4);
  });

  it("constructs each worker with shared resources and only its registered duties", async () => {
    const calls: string[] = [];
    const registry = new ConsumerRegistry();
    const components = {
      database: recordingComponent("database", calls),
      "inbox-consumer": recordingComponent("inbox-consumer", calls),
      "outbox-dispatcher": recordingComponent("outbox-dispatcher", calls),
      queue: recordingComponent("queue", calls),
      "synthetic-market-ingest": recordingComponent(
        "synthetic-market-ingest",
        calls,
      ),
      telemetry: recordingComponent("telemetry", calls),
    };

    const events = createEventsWorker({
      adapterMode: "injected",
      components,
      registry,
    });
    await events.start();
    await events.stop();

    const market = createMarketWorker({
      adapterMode: "injected",
      components,
      registry,
    });
    await market.start();
    await market.stop();

    expect(calls).toEqual([
      "start:telemetry",
      "start:database",
      "start:queue",
      "start:inbox-consumer",
      "start:outbox-dispatcher",
      "stop:outbox-dispatcher",
      "stop:inbox-consumer",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
      "start:telemetry",
      "start:database",
      "start:queue",
      "start:synthetic-market-ingest",
      "stop:synthetic-market-ingest",
      "stop:queue",
      "stop:database",
      "stop:telemetry",
    ]);
  });

  it("labels local synthetic roots and installs only their declared duties", () => {
    const registry = new ConsumerRegistry();
    const events = createEventsWorker({
      adapterMode: "local-synthetic",
      registry,
    });
    const market = createMarketWorker({
      adapterMode: "local-synthetic",
      registry,
    });

    expect(events.adapterMode).toBe("local-synthetic");
    expect(events.componentNames()).toEqual([
      "inbox-consumer",
      "outbox-dispatcher",
    ]);
    expect(market.adapterMode).toBe("local-synthetic");
    expect(market.componentNames()).toEqual(["synthetic-market-ingest"]);
  });

  it("fails closed when injected mode omits any required adapter", () => {
    const registry = new ConsumerRegistry();

    expect(() =>
      createEventsWorker({ adapterMode: "injected", registry }),
    ).toThrow(
      "Missing injected worker components: telemetry, database, queue, inbox-consumer, outbox-dispatcher",
    );
    expect(() =>
      createMarketWorker({
        adapterMode: "injected",
        components: {
          database: recordingComponent("database", []),
          queue: recordingComponent("queue", []),
          telemetry: recordingComponent("telemetry", []),
        },
        registry,
      }),
    ).toThrow("Missing injected worker components: synthetic-market-ingest");
  });

  it("selects injected fail-closed mode when APP_ENV is production", () => {
    const originalAppEnvironment = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    try {
      expect(() =>
        createEventsWorker({ registry: new ConsumerRegistry() }),
      ).toThrow("Missing injected worker components");
    } finally {
      if (originalAppEnvironment === undefined) {
        Reflect.deleteProperty(process.env, "APP_ENV");
      } else {
        process.env.APP_ENV = originalAppEnvironment;
      }
    }
  });

  it("fails closed when APP_ENV is omitted from a NODE_ENV production process", () => {
    const originalAppEnvironment = process.env.APP_ENV;
    const originalNodeEnvironment = process.env.NODE_ENV;
    Reflect.deleteProperty(process.env, "APP_ENV");
    process.env.NODE_ENV = "production";
    try {
      expect(() =>
        createEventsWorker({ registry: new ConsumerRegistry() }),
      ).toThrow("Missing injected worker components");
      expect(() =>
        createMarketWorker({ registry: new ConsumerRegistry() }),
      ).toThrow("Missing injected worker components");
      expect(() =>
        createRegisteredWorker("events", new ConsumerRegistry()),
      ).toThrow("Missing injected worker components");
    } finally {
      if (originalAppEnvironment === undefined) {
        Reflect.deleteProperty(process.env, "APP_ENV");
      } else {
        process.env.APP_ENV = originalAppEnvironment;
      }
      if (originalNodeEnvironment === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        process.env.NODE_ENV = originalNodeEnvironment;
      }
    }
  });

  it("allows synthetic mode only for local/test environments and rejects invalid values", () => {
    expect(defaultWorkerAdapterMode({ APP_ENV: "local" })).toBe(
      "local-synthetic",
    );
    expect(defaultWorkerAdapterMode({ APP_ENV: "test" })).toBe(
      "local-synthetic",
    );
    expect(defaultWorkerAdapterMode({ APP_ENV: "staging" })).toBe(
      "injected",
    );
    expect(defaultWorkerAdapterMode({ APP_ENV: "production" })).toBe(
      "injected",
    );
    expect(() => defaultWorkerAdapterMode({ APP_ENV: "" })).toThrow(
      "Unsupported APP_ENV",
    );
    expect(() =>
      defaultWorkerAdapterMode({ APP_ENV: "preview" }),
    ).toThrow("Unsupported APP_ENV");
    expect(() =>
      defaultWorkerAdapterMode({ NODE_ENV: "preview" }),
    ).toThrow("Unsupported NODE_ENV");
  });
});
