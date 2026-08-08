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

export const createEventsWorker = (
  options: WorkerStartOptions = {},
): WorkerRuntime =>
  new WorkerRuntime("events", options.registry ?? processConsumerRegistry);

export const startEventsWorker = async (
  options: WorkerStartOptions = {},
): Promise<WorkerRuntime> => {
  const worker = createEventsWorker(options);
  await worker.start();
  return worker;
};

if (isDirectRun(import.meta.url)) {
  void runWorkerProcess(startEventsWorker, {
    onReady: () => {
      reportProcessReady({
        activeConsumers: processConsumerRegistry.activeConsumers(),
        consumer: "events",
        event: "worker.ready",
        tcpServerCount: activeTcpServerCount(),
      });
    },
  }).catch(() => {
    process.stderr.write(
      `${JSON.stringify({ consumer: "events", event: "worker.failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
