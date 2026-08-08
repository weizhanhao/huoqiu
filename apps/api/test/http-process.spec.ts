import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { listenHttpApplication } from "../src/main.js";
import { runHttpProcess } from "../src/runtime/run-http-process.js";
import { waitForShutdownSignal } from "../src/runtime/shutdown-signal.js";

const withTimeout = async <T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

describe("HTTP production process lifecycle", () => {
  it("closes the application after the first shutdown signal and removes both listeners", async () => {
    const signals = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const application = { close };
    const running = runHttpProcess(async () => application, {
      signalSource: signals,
    });

    await vi.waitFor(() => {
      expect(signals.listenerCount("SIGINT")).toBe(1);
      expect(signals.listenerCount("SIGTERM")).toBe(1);
    });
    signals.emit("SIGTERM");

    await expect(running).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("closes the application when readiness reporting fails", async () => {
    const close = vi.fn(async () => undefined);
    const readinessError = new Error("readiness failed");
    const signals = new EventEmitter();

    await expect(
      runHttpProcess(async () => ({ close }), {
        onReady: async () => Promise.reject(readinessError),
        signalSource: signals,
      }),
    ).rejects.toBe(readinessError);
    expect(close).toHaveBeenCalledOnce();
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("closes an application whose listen operation fails", async () => {
    const listenError = new Error("address in use");
    const listen = vi.fn(async () => Promise.reject(listenError));
    const close = vi.fn(async () => undefined);
    const application = { close, listen };

    await expect(
      listenHttpApplication(application, {
        host: "127.0.0.1",
        port: 30_001,
      }),
    ).rejects.toBe(listenError);
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports a neutral failure and exits nonzero when the direct entrypoint cannot listen", async () => {
    const occupiedPort = createServer();
    await new Promise<void>((resolve, reject) => {
      occupiedPort.once("error", reject);
      occupiedPort.listen(0, "127.0.0.1", resolve);
    });
    const address = occupiedPort.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an IP listener address");
    }

    const applicationDirectory = fileURLToPath(new URL("..", import.meta.url));
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
    const child = spawn(process.execPath, [tsxCli, "src/main.ts"], {
      cwd: applicationDirectory,
      env: {
        ...process.env,
        HTTP_HOST: "127.0.0.1",
        NODE_ENV: "production",
        PORT: String(address.port),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let standardError = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      standardError += chunk;
    });
    const exit = new Promise<
      Readonly<{ code: number | null; signal: NodeJS.Signals | null }>
    >((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });

    try {
      await expect(
        withTimeout(exit, 10_000, "API failure process did not exit"),
      ).resolves.toEqual({ code: 1, signal: null });
      expect(standardError).toContain(
        '{"event":"api.failed","reason":"ADDRESS_IN_USE"}',
      );
      expect(standardError).not.toContain("EADDRINUSE");
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exit;
      }
      await new Promise<void>((resolve, reject) => {
        occupiedPort.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});

it("settles on the first signal and cleans up both signal listeners", async () => {
  const signals = new EventEmitter();
  const shutdown = waitForShutdownSignal(signals);

  expect(signals.listenerCount("SIGINT")).toBe(1);
  expect(signals.listenerCount("SIGTERM")).toBe(1);

  signals.emit("SIGINT");
  signals.emit("SIGTERM");

  await expect(shutdown).resolves.toBe("SIGINT");
  expect(signals.listenerCount("SIGINT")).toBe(0);
  expect(signals.listenerCount("SIGTERM")).toBe(0);
});
