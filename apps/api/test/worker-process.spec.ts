import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { waitForShutdownSignal } from "../src/runtime/shutdown-signal.js";

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
    const child = spawn(
      process.execPath,
      [tsxCli, `src/workers/${entrypoint}`],
      {
        cwd: applicationDirectory,
        stdio: "ignore",
      },
    );
    const exit = new Promise<
      Readonly<{ code: number | null; signal: NodeJS.Signals | null }>
    >((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });

    try {
      await delay(200);
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
