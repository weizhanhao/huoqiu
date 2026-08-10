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

export const createMarketWorker = (
  options: WorkerStartOptions = {},
): WorkerRuntime =>
  createRegisteredWorker(
    "market",
    options.registry ?? processConsumerRegistry,
    options.components,
    options.adapterMode ?? defaultWorkerAdapterMode(),
  );

export const startMarketWorker = async (
  options: WorkerStartOptions = {},
): Promise<WorkerRuntime> => {
  const worker = createMarketWorker(options);
  await worker.start();
  return worker;
};

if (isDirectRun(import.meta.url)) {
  void runWorkerProcess(startMarketWorker, {
    onReady: (worker) => {
      const readiness = {
        activeConsumers: processConsumerRegistry.activeConsumers(),
        adapterMode: worker.adapterMode,
        components: worker.componentNames(),
        consumer: "market",
        durable: worker.adapterMode === "injected",
        event: "worker.ready",
        tcpServerCount: activeTcpServerCount(),
      } as const;
      reportProcessReady(readiness);
    },
  }).catch(() => {
    process.stderr.write(
      `${JSON.stringify({ consumer: "market", event: "worker.failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
