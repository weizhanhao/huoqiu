import {
  createShutdownSignalWaiter,
  type ShutdownSignalSource,
} from "../runtime/shutdown-signal.js";
import type { WorkerRuntime } from "./worker-runtime.js";

type RunWorkerProcessOptions = Readonly<{
  onReady?: (worker: WorkerRuntime) => Promise<void> | void;
  signalSource?: ShutdownSignalSource;
}>;

export const runWorkerProcess = async (
  start: () => Promise<WorkerRuntime>,
  options: RunWorkerProcessOptions = {},
): Promise<void> => {
  const worker = await start();
  const shutdown = createShutdownSignalWaiter(options.signalSource ?? process);

  try {
    await options.onReady?.(worker);
    await shutdown.promise;
  } finally {
    shutdown.dispose();
    await worker.stop();
  }
};
