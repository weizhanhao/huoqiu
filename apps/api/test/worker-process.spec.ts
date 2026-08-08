import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { waitForShutdownSignal } from "../src/runtime/shutdown-signal.js";

const waitForWorkerReady = async (
  child: ReturnType<typeof spawn>,
  consumer: string,
): Promise<void> =>
  await new Promise<void>((resolve, reject) => {
    if (child.stdout === null)
      return reject(new Error("worker stdout must be piped"));
    let buffer = "";
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stdout?.off("data", onData);
      callback();
    };
    const onError = (error: Error): void => settle(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void =>
      settle(() =>
        reject(
          new Error(
            `worker exited before readiness (code=${String(code)}, signal=${String(signal)})`,
          ),
        ),
      );
    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        let event: unknown;
        try {
          event = JSON.parse(line) as unknown;
        } catch (error) {
          settle(() => reject(error as Error));
          return;
        }
        if (
          typeof event === "object" &&
          event !== null &&
          "event" in event &&
          event.event === "worker.ready" &&
          "consumer" in event &&
          event.consumer === consumer
        ) {
          settle(resolve);
          return;
        }
      }
    };
    const timeout = setTimeout(
      () => settle(() => reject(new Error("worker readiness timed out"))),
      15_000,
    );
    child.once("error", onError);
    child.once("exit", onExit);
    child.stdout.on("data", onData);
  });

it("removes both process signal listeners after the first shutdown signal", async () => {
  const signals = new EventEmitter();
  const shutdown = waitForShutdownSignal(signals);

  expect(signals.listenerCount("SIGINT")).toBe(1);
  expect(signals.listenerCount("SIGTERM")).toBe(1);

  signals.emit("SIGTERM");

  await expect(shutdown).resolves.toBe("SIGTERM");
  expect(signals.listenerCount("SIGINT")).toBe(0);
  expect(signals.listenerCount("SIGTERM")).toBe(0);
});

it.each(["events.main.ts", "market.main.ts"])(
  "keeps the %s entrypoint alive until a shutdown signal",
  async (entrypoint) => {
    const applicationDirectory = fileURLToPath(new URL("..", import.meta.url));
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
    const consumer = entrypoint.split(".")[0] as string;
    const child = spawn(
      process.execPath,
      [tsxCli, `src/workers/${entrypoint}`],
      {
        cwd: applicationDirectory,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exit = new Promise<
      Readonly<{ code: number | null; signal: NodeJS.Signals | null }>
    >((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });

    try {
      await waitForWorkerReady(child, consumer);
      expect(child.exitCode).toBeNull();

      child.kill("SIGTERM");
      await expect(exit).resolves.toEqual({ code: 0, signal: null });
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exit;
      }
    }
  },
);
