import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { waitForShutdownSignal } from "../src/runtime/shutdown-signal.js";

const READY_TIMEOUT_MS = 10_000;

const waitForWorkerReady = async (
  child: ReturnType<typeof spawn>,
  consumer: string,
): Promise<void> =>
  await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for ${consumer} worker.ready; stderr=${stderr}`,
        ),
      );
    }, READY_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.off("exit", onExit);
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `${consumer} exited before worker.ready: code=${String(code)} signal=${String(signal)} stderr=${stderr}`,
        ),
      );
    };
    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/u);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {
            consumer?: unknown;
            event?: unknown;
          };
          if (event.event === "worker.ready" && event.consumer === consumer) {
            cleanup();
            resolve();
            return;
          }
        } catch {
          // Ignore non-JSON diagnostics until the bounded readiness deadline.
        }
      }
    };
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.once("exit", onExit);
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
      await waitForWorkerReady(child, entrypoint.replace(".main.ts", ""));
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
