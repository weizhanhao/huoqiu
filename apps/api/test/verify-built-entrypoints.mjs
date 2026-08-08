import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const applicationDirectory = fileURLToPath(new URL("..", import.meta.url));
const readyTimeoutMilliseconds = 15_000;
const shutdownTimeoutMilliseconds = 5_000;
const maximumPortAllocationAttempts = 3;

const withTimeout = async (promise, milliseconds, message) => {
  let timeout;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

const spawnEntrypoint = (relativePath, environment = {}) => {
  const child = spawn(process.execPath, [relativePath], {
    cwd: applicationDirectory,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let standardError = "";
  const onStandardError = (chunk) => {
    standardError = `${standardError}${String(chunk)}`.slice(-8_192);
  };
  child.stderr.on("data", onStandardError);
  const exit = new Promise((resolve) => {
    child.once("error", (error) => {
      resolve({ code: null, error, signal: null });
    });
    child.once("exit", (code, signal) => {
      resolve({ code, error: undefined, signal });
    });
  });

  return {
    child,
    exit,
    relativePath,
    standardError: () => standardError,
    stopCapturingError: () => child.stderr.off("data", onStandardError),
  };
};

const describeExit = (entrypoint, result, standardError) => {
  const failure = standardError.trim();
  const suffix = failure === "" ? "" : `; stderr: ${failure}`;

  if (result.error !== undefined) {
    return `${entrypoint} could not spawn: ${result.error.message}${suffix}`;
  }

  return `${entrypoint} exited before verification (code=${String(result.code)}, signal=${String(result.signal)})${suffix}`;
};

const waitForReadyEvent = (entrypoint, predicate) =>
  new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const { child } = entrypoint;

    const cleanup = () => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stdout.off("data", onData);
      child.stdout.off("end", onEnd);
      child.stdout.off("error", onError);
    };
    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };
    const inspectLine = (line) => {
      try {
        const event = JSON.parse(line);
        if (predicate(event)) {
          settle(() => resolve(event));
        }
      } catch {
        // Framework logs are allowed; only JSON readiness records are matched.
      }
    };
    const onData = (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        inspectLine(line);
      }
    };
    const onEnd = () => {
      if (buffer !== "") {
        inspectLine(buffer);
      }
      settle(() =>
        reject(
          new Error(
            `${entrypoint.relativePath} closed stdout before readiness`,
          ),
        ),
      );
    };
    const onError = (error) => {
      settle(() => reject(error));
    };
    const onExit = (code, signal) => {
      settle(() =>
        reject(
          new Error(
            describeExit(
              entrypoint.relativePath,
              { code, error: undefined, signal },
              entrypoint.standardError(),
            ),
          ),
        ),
      );
    };
    const timeout = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            `${entrypoint.relativePath} did not report readiness within ${String(readyTimeoutMilliseconds)}ms`,
          ),
        ),
      );
    }, readyTimeoutMilliseconds);

    child.once("error", onError);
    child.once("exit", onExit);
    child.stdout.on("data", onData);
    child.stdout.once("end", onEnd);
    child.stdout.once("error", onError);
  });

const stopGracefully = async (entrypoint) => {
  assert.equal(
    entrypoint.child.exitCode,
    null,
    `${entrypoint.relativePath} must be alive before SIGTERM`,
  );
  assert.equal(
    entrypoint.child.signalCode,
    null,
    `${entrypoint.relativePath} must not have received a signal before verification`,
  );
  assert.equal(
    entrypoint.child.kill("SIGTERM"),
    true,
    `${entrypoint.relativePath} did not accept SIGTERM`,
  );
  const result = await withTimeout(
    entrypoint.exit,
    shutdownTimeoutMilliseconds,
    `${entrypoint.relativePath} did not exit after SIGTERM`,
  );

  assert.equal(
    result.error,
    undefined,
    describeExit(entrypoint.relativePath, result, entrypoint.standardError()),
  );
  assert.deepEqual(
    { code: result.code, signal: result.signal },
    { code: 0, signal: null },
    `${entrypoint.relativePath} must close gracefully after SIGTERM`,
  );
};

const forceCleanup = async (entrypoint) => {
  if (
    entrypoint.child.exitCode === null &&
    entrypoint.child.signalCode === null
  ) {
    entrypoint.child.kill("SIGKILL");
  }

  await withTimeout(
    entrypoint.exit,
    shutdownTimeoutMilliseconds,
    `${entrypoint.relativePath} could not be cleaned up`,
  ).catch(() => undefined);
  entrypoint.stopCapturingError();
  entrypoint.child.stdout.destroy();
  entrypoint.child.stderr.destroy();
};

const pollHealth = async (baseUrl) => {
  const healthUrl = new URL("/healthz", baseUrl);
  const deadline = Date.now() + readyTimeoutMilliseconds;
  let lastFailure = new Error("Health endpoint was not attempted");

  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(healthUrl, {
        headers: { "x-request-id": "verify-dist-main" },
        signal: globalThis.AbortSignal.timeout(1_000),
      });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.equal(body, '{"status":"ok"}');
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.equal(response.headers.get("x-request-id"), "verify-dist-main");
      return;
    } catch (error) {
      lastFailure = error;
      await delay(50);
    }
  }

  throw new Error(`Compiled API health verification failed: ${lastFailure}`);
};

const allocateEphemeralPort = async () => {
  const reservation = createServer();

  try {
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening", {
      signal: globalThis.AbortSignal.timeout(5_000),
    });
    const address = reservation.address();
    if (address === null || typeof address === "string") {
      throw new Error("Ephemeral port reservation did not return an IP port");
    }
    return address.port;
  } finally {
    await new Promise((resolve) => {
      reservation.close(() => resolve());
    });
  }
};

const verifyHttpEntrypoint = async () => {
  let lastPortCollision;

  for (
    let attempt = 1;
    attempt <= maximumPortAllocationAttempts;
    attempt += 1
  ) {
    const port = await allocateEphemeralPort();
    const entrypoint = spawnEntrypoint("dist/main.js", {
      HTTP_HOST: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(port),
    });

    try {
      const ready = await waitForReadyEvent(
        entrypoint,
        (event) => event.event === "http.ready",
      );
      assert.equal(typeof ready.url, "string");
      const url = new URL(ready.url);
      assert.equal(url.hostname, "127.0.0.1");
      assert.equal(Number(url.port), port);

      await pollHealth(url);
      await stopGracefully(entrypoint);
      process.stdout.write(
        "dist/main.js: health boundary and graceful shutdown verified\n",
      );
      return;
    } catch (error) {
      const addressCollision = entrypoint
        .standardError()
        .includes('"reason":"ADDRESS_IN_USE"');
      if (!addressCollision || attempt === maximumPortAllocationAttempts) {
        throw error;
      }
      lastPortCollision = error;
    } finally {
      await forceCleanup(entrypoint);
    }
  }

  throw lastPortCollision ?? new Error("Could not allocate an API port");
};

const verifyWorkerEntrypoint = async (consumer) => {
  const entrypoint = spawnEntrypoint(`dist/workers/${consumer}.main.js`, {
    NODE_ENV: "production",
  });

  try {
    const ready = await waitForReadyEvent(
      entrypoint,
      (event) => event.event === "worker.ready" && event.consumer === consumer,
    );
    assert.deepEqual(ready.activeConsumers, [consumer]);
    assert.equal(
      ready.tcpServerCount,
      0,
      `${entrypoint.relativePath} unexpectedly opened an HTTP listener`,
    );

    await stopGracefully(entrypoint);
    process.stdout.write(
      `${entrypoint.relativePath}: consumer/no-HTTP boundary and graceful shutdown verified\n`,
    );
  } finally {
    await forceCleanup(entrypoint);
  }
};

await verifyHttpEntrypoint();
await verifyWorkerEntrypoint("events");
await verifyWorkerEntrypoint("market");
