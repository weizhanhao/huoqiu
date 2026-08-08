export type ShutdownSignal = "SIGINT" | "SIGTERM";

export type ShutdownSignalSource = Readonly<{
  off(signal: ShutdownSignal, listener: () => void): unknown;
  once(signal: ShutdownSignal, listener: () => void): unknown;
}>;

export type ShutdownSignalWaiter = Readonly<{
  dispose(): void;
  promise: Promise<ShutdownSignal>;
}>;

export const createShutdownSignalWaiter = (
  source: ShutdownSignalSource = process,
): ShutdownSignalWaiter => {
  let settled = false;
  let resolveSignal: (signal: ShutdownSignal) => void = () => undefined;
  const promise = new Promise<ShutdownSignal>((resolve) => {
    resolveSignal = resolve;
  });
  const cleanup = (): void => {
    source.off("SIGINT", onInterrupt);
    source.off("SIGTERM", onTerminate);
  };
  const settle = (signal: ShutdownSignal): void => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    resolveSignal(signal);
  };
  const onInterrupt = (): void => settle("SIGINT");
  const onTerminate = (): void => settle("SIGTERM");

  source.once("SIGINT", onInterrupt);
  source.once("SIGTERM", onTerminate);

  return {
    dispose: () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
    },
    promise,
  };
};

export const waitForShutdownSignal = (
  source: ShutdownSignalSource = process,
): Promise<ShutdownSignal> => createShutdownSignalWaiter(source).promise;
