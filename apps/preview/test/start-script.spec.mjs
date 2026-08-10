import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect, createServer as createNetServer } from "node:net";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { describe, it } from "node:test";
import { fileURLToPath, URL } from "node:url";

const HOST = "127.0.0.1";
const startScript = fileURLToPath(
  new URL("../scripts/start-local.mjs", import.meta.url),
);

const availablePort = async () =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      assert.notEqual(address, null);
      assert.equal(typeof address, "object");
      server.close((error) =>
        error === undefined ? resolve(address.port) : reject(error),
      );
    });
  });

const portAcceptsConnections = async (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: HOST, port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(50, () => finish(false));
  });

const runStart = async (environmentOverride) => {
  const [port, webPort] = await Promise.all([availablePort(), availablePort()]);
  assert.notEqual(port, webPort);
  const omitted = new Set([
    "APP_ENV",
    "PREVIEW_BASIC_PASSWORD",
    "PREVIEW_BASIC_USERNAME",
    "PREVIEW_GATEWAY_SHA",
    "PREVIEW_PRODUCT_SHA",
  ]);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !omitted.has(name)),
  );
  Object.assign(environment, environmentOverride);
  const child = spawn(
    process.execPath,
    [
      startScript,
      "--hostname",
      HOST,
      "--port",
      String(port),
      "--web-port",
      String(webPort),
    ],
    {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PREVIEW_PREFLIGHT_TIMEOUT"));
    }, 5_000);
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });
  return {
    code,
    connected: await portAcceptsConnections(port),
    stderr,
    stdout,
  };
};

const validEnvironment = {
  APP_ENV: "local",
  PREVIEW_BASIC_PASSWORD: "correct-horse-battery-staple",
  PREVIEW_BASIC_USERNAME: "previewer",
  PREVIEW_GATEWAY_SHA: "1111111111111111111111111111111111111111",
  PREVIEW_PRODUCT_SHA: "99754f102dc2d8ee49b34dc9e7fd6c13717337ef",
};

describe("local preview CLI preflight", () => {
  it("rejects missing credentials before opening the gateway", async () => {
    const result = await runStart({ APP_ENV: "local" });

    assert.notEqual(result.code, 0);
    assert.equal(result.stderr, "PREVIEW_CONFIGURATION_INVALID\n");
    assert.equal(result.stdout, "");
    assert.equal(result.connected, false);
    assert.doesNotMatch(
      result.stderr,
      /MODULE_NOT_FOUND|stack|node:internal/iu,
    );
  });

  it("rejects production classification before opening the gateway", async () => {
    const result = await runStart({
      ...validEnvironment,
      APP_ENV: "production",
    });

    assert.notEqual(result.code, 0);
    assert.equal(result.stderr, "PREVIEW_CONFIGURATION_INVALID\n");
    assert.equal(result.connected, false);
  });

  it("requires an existing built Web artifact before starting either process", async () => {
    const result = await runStart(validEnvironment);

    assert.notEqual(result.code, 0);
    assert.equal(result.stderr, "PREVIEW_BUILD_MISSING\n");
    assert.equal(result.stdout, "");
    assert.equal(result.connected, false);
    assert.doesNotMatch(
      result.stderr,
      /correct-horse|99754f|111111|ENOENT|\/Users\//iu,
    );
  });
});
