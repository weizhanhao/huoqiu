import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "../src/main.js";
import {
  ConsumerRegistry,
  DuplicateConsumerRegistrationError,
  processConsumerRegistry,
} from "../src/workers/consumer-registry.js";
import { startEventsWorker } from "../src/workers/events.main.js";
import { startMarketWorker } from "../src/workers/market.main.js";
import type { WorkerRuntime } from "../src/workers/worker-runtime.js";

const openWorkers = new Set<WorkerRuntime>();

afterEach(async () => {
  await Promise.all(
    [...openWorkers].map(async (worker) => {
      await worker.stop();
      openWorkers.delete(worker);
    }),
  );
});

describe("independently deployable worker entrypoints", () => {
  it("starts and stops each consumer without an HTTP application", async () => {
    const registry = new ConsumerRegistry();
    const listeningServersBefore = process
      .getActiveResourcesInfo()
      .filter((resource) => resource === "TCPServerWrap").length;
    const events = await startEventsWorker({ registry });
    const market = await startMarketWorker({ registry });
    openWorkers.add(events);
    openWorkers.add(market);

    expect(registry.activeConsumers()).toEqual(["events", "market"]);
    expect(
      process
        .getActiveResourcesInfo()
        .filter((resource) => resource === "TCPServerWrap"),
    ).toHaveLength(listeningServersBefore);

    await events.stop();
    await market.stop();
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("makes repeated start and stop calls deterministic", async () => {
    const registry = new ConsumerRegistry();
    const worker = await startEventsWorker({ registry });
    openWorkers.add(worker);

    await worker.start();
    expect(registry.activeConsumers()).toEqual(["events"]);

    await worker.stop();
    await worker.stop();
    expect(registry.activeConsumers()).toEqual([]);
  });

  it("rejects a second live registration for the same consumer", async () => {
    const registry = new ConsumerRegistry();
    const first = await startEventsWorker({ registry });
    openWorkers.add(first);

    await expect(startEventsWorker({ registry })).rejects.toBeInstanceOf(
      DuplicateConsumerRegistrationError,
    );
    expect(registry.activeConsumers()).toEqual(["events"]);
  });

  it("does not register a queue consumer in the HTTP process", async () => {
    const registrationAttemptsBefore =
      processConsumerRegistry.registrationAttempts();
    const application = await createHttpApp();

    expect(processConsumerRegistry.activeConsumers()).toEqual([]);
    expect(processConsumerRegistry.registrationAttempts()).toBe(
      registrationAttemptsBefore,
    );

    await application.close();
  });
});
