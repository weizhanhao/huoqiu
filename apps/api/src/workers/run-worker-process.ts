import type { WorkerRuntime } from "./worker-runtime.js";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export type ShutdownSignalSource = Readonly<{
  off(signal: ShutdownSignal, listener: () => void): unknown;
  once(signal: ShutdownSignal, listener: () => void): unknown;
}>;

export const waitForShutdownSignal = (
  source: ShutdownSignalSource = process,
): Promise<ShutdownSignal> =>
  new Promise((resolve) => {
    const onInterrupt = (): void => settle("SIGINT");
    const onTerminate = (): void => settle("SIGTERM");

    function settle(signal: ShutdownSignal): void {
      source.off("SIGINT", onInterrupt);
      source.off("SIGTERM", onTerminate);
      resolve(signal);
    }

    source.once("SIGINT", onInterrupt);
    source.once("SIGTERM", onTerminate);
  });

export const runWorkerProcess = async (
  start: () => Promise<WorkerRuntime>,
): Promise<void> => {
  const worker = await start();
  await waitForShutdownSignal();
  await worker.stop();
};
