import { isDirectRun } from "../runtime/direct-run.js";
import {
  activeTcpServerCount,
  reportProcessReady,
} from "../runtime/process-ready.js";
import {
  type ConsumerRegistry,
  processConsumerRegistry,
} from "./consumer-registry.js";
import { runWorkerProcess } from "./run-worker-process.js";
import type {
  WorkerAdapterMode,
  WorkerRuntime,
} from "./worker-runtime.js";
import {
  createRegisteredWorker,
  defaultWorkerAdapterMode,
  type WorkerComponentOverrides,
} from "./worker-registry.js";

type WorkerStartOptions = Readonly<{
  adapterMode?: WorkerAdapterMode;
  components?: WorkerComponentOverrides;
  registry?: ConsumerRegistry;
}>;

export const createEventsWorker = (
  options: WorkerStartOptions = {},
): WorkerRuntime =>
  createRegisteredWorker(
    "events",
    options.registry ?? processConsumerRegistry,
    options.components,
    options.adapterMode ?? defaultWorkerAdapterMode(),
  );

export const startEventsWorker = async (
  options: WorkerStartOptions = {},
): Promise<WorkerRuntime> => {
  const worker = createEventsWorker(options);
  await worker.start();
  return worker;
};

if (isDirectRun(import.meta.url)) {
  void runWorkerProcess(startEventsWorker, {
    onReady: (worker) => {
      const readiness = {
        activeConsumers: processConsumerRegistry.activeConsumers(),
        adapterMode: worker.adapterMode,
        components: worker.componentNames(),
        consumer: "events",
        durable: worker.adapterMode === "injected",
        event: "worker.ready",
        tcpServerCount: activeTcpServerCount(),
      } as const;
      reportProcessReady(readiness);
    },
  }).catch(() => {
    process.stderr.write(
      `${JSON.stringify({ consumer: "events", event: "worker.failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
