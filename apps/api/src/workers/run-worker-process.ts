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
  const shutdown = createShutdownSignalWaiter(options.signalSource ?? process);
  let shutdownRequested = false;
  const shutdownSignal = shutdown.promise.then((signal) => {
    shutdownRequested = true;
    return signal;
  });
  let worker: WorkerRuntime | undefined;

  try {
    worker = await start();
    if (!shutdownRequested) {
      await options.onReady?.(worker);
    }
    await shutdownSignal;
  } finally {
    shutdown.dispose();
    await worker?.stop();
  }
};
