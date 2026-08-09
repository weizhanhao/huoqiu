import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const startScript = fileURLToPath(
  new URL("../scripts/start.mjs", import.meta.url),
);
const host = "127.0.0.1";

const availablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("TEST_PORT_UNAVAILABLE"));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });

const portAcceptsConnections = async (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(50, () => finish(false));
  });

type StartResult = Readonly<{
  code: number | null;
  connected: boolean;
  stderr: string;
}>;

const spawnStart = async (
  environmentOverride: Readonly<Record<string, string>>,
): Promise<StartResult> => {
  const port = await availablePort();
  const omittedEnvironmentNames = new Set([
    "APP_ENV",
    "ZERO_TRUST_HMAC_SECRET",
    "ZERO_TRUST_ISSUER",
    "ZERO_TRUST_MAX_SKEW_SECONDS",
  ]);
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "test",
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !omittedEnvironmentNames.has(name),
      ),
    ),
  };
  Object.assign(environment, environmentOverride);

  const child = spawn(
    process.execPath,
    [startScript, "--hostname", host, "--port", String(port)],
    {
      cwd: appRoot,
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let connected = false;
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const monitor = setInterval(() => {
    void portAcceptsConnections(port).then((accepted) => {
      connected ||= accepted;
    });
  }, 10);

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("START_PREFLIGHT_TIMEOUT"));
    }, 5_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  }).finally(() => clearInterval(monitor));

  connected ||= await portAcceptsConnections(port);
  return { code, connected, stderr };
};

describe("Web production start preflight", () => {
  it.each([
    ["NODE_ENV production", { NODE_ENV: "production" }],
    ["APP_ENV production", { APP_ENV: "production", NODE_ENV: "test" }],
    ["APP_ENV staging", { APP_ENV: "staging", NODE_ENV: "test" }],
  ])(
    "fails before listen for %s without Zero Trust config",
    async (_label, environment) => {
      const result = await spawnStart(environment);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("ZERO_TRUST_CONFIGURATION_INVALID");
      expect(result.stderr).not.toContain("MODULE_NOT_FOUND");
      expect(result.connected).toBe(false);
    },
  );
});
