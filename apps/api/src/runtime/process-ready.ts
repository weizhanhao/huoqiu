type HttpReadyEvent = Readonly<{
  event: "http.ready";
  url: string;
}>;

type WorkerReadyEvent = Readonly<{
  activeConsumers: readonly string[];
  consumer: string;
  event: "worker.ready";
  tcpServerCount: number;
}>;

type ProcessReadyEvent = HttpReadyEvent | WorkerReadyEvent;

export const activeTcpServerCount = (): number =>
  process
    .getActiveResourcesInfo()
    .filter((resource) => resource === "TCPServerWrap").length;

export const reportProcessReady = (event: ProcessReadyEvent): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};
