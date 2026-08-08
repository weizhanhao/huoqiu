import {
  createShutdownSignalWaiter,
  type ShutdownSignalSource,
} from "./shutdown-signal.js";

type ClosableHttpApplication = Readonly<{
  close(): Promise<void>;
}>;

type RunHttpProcessOptions<TApplication extends ClosableHttpApplication> =
  Readonly<{
    onReady?: (application: TApplication) => Promise<void> | void;
    signalSource?: ShutdownSignalSource;
  }>;

export const runHttpProcess = async <
  TApplication extends ClosableHttpApplication,
>(
  start: () => Promise<TApplication>,
  options: RunHttpProcessOptions<TApplication> = {},
): Promise<void> => {
  const application = await start();
  const shutdown = createShutdownSignalWaiter(options.signalSource ?? process);

  try {
    await options.onReady?.(application);
    await shutdown.promise;
  } finally {
    shutdown.dispose();
    await application.close();
  }
};
