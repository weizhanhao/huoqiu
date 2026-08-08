import { isDirectRun } from "../runtime/direct-run.js";
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
  void runWorkerProcess(startEventsWorker).catch((error: unknown) => {
    console.error("Events worker failed", error);
    process.exitCode = 1;
  });
}
