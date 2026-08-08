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
import { WorkerRuntime } from "./worker-runtime.js";

type WorkerStartOptions = Readonly<{
  registry?: ConsumerRegistry;
}>;

export const createMarketWorker = (
  options: WorkerStartOptions = {},
): WorkerRuntime =>
  new WorkerRuntime("market", options.registry ?? processConsumerRegistry);

export const startMarketWorker = async (
  options: WorkerStartOptions = {},
): Promise<WorkerRuntime> => {
  const worker = createMarketWorker(options);
  await worker.start();
  return worker;
};

if (isDirectRun(import.meta.url)) {
  void runWorkerProcess(startMarketWorker, {
    onReady: () => {
      reportProcessReady({
        activeConsumers: processConsumerRegistry.activeConsumers(),
        consumer: "market",
        event: "worker.ready",
        tcpServerCount: activeTcpServerCount(),
      });
    },
  }).catch(() => {
    process.stderr.write(
      `${JSON.stringify({ consumer: "market", event: "worker.failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
