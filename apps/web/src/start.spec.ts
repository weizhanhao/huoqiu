import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import { connect, createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  handleWebIngressClientError,
  WEB_INGRESS_SERVER_OPTIONS,
} from "./upload-ingress";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const startScript = fileURLToPath(
  new URL("../scripts/start.mjs", import.meta.url),
);
const nextConfigurationUrl = new URL("../next.config.ts", import.meta.url).href;
const host = "127.0.0.1";

const availablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
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

  it("owns the guarded Node HTTP ingress instead of delegating to next start", async () => {
    const source = await readFile(startScript, "utf8");

    expect(source).toContain("createServer(WEB_INGRESS_SERVER_OPTIONS");
    expect(source).toContain(
      'server.on("clientError", handleWebIngressClientError)',
    );
    expect(source).not.toContain("spawn(");
  });

  it("loads the production Next configuration with Node type stripping", async () => {
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(nextConfigurationUrl)})`,
      ],
      {
        cwd: appRoot,
        env: {
          ...process.env,
          APP_ENV: "local",
          NODE_ENV: "production",
          ZERO_TRUST_HMAC_SECRET:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          ZERO_TRUST_ISSUER: "huoqiu-local-preview",
          ZERO_TRUST_MAX_SKEW_SECONDS: "60",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    expect(code).toBe(0);
    expect(stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });
});

type SlowUploadResult = Readonly<{
  elapsedMilliseconds: number;
  status: number | undefined;
}>;

const probeSlowUpload = (
  port: number,
  mode: "chunked" | "content-length",
): Promise<SlowUploadResult> =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    const request = httpRequest(
      {
        headers: {
          "content-type": "application/json",
          ...(mode === "content-length" ? { "content-length": "2" } : {}),
        },
        host,
        method: "POST",
        path: "/watchlist",
        port,
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(finishUpload);
          request.destroy();
          resolve({
            elapsedMilliseconds: Date.now() - startedAt,
            status: response.statusCode,
          });
        });
      },
    );
    request.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(finishUpload);
      reject(error);
    });
    request.flushHeaders();
    request.write("{");
    const finishUpload = setTimeout(() => request.end("}"), 2_000);
  });

describe("Web Node ingress upload deadline", () => {
  it("rejects slow Content-Length and chunked uploads at about one second", async () => {
    const server = createHttpServer(
      WEB_INGRESS_SERVER_OPTIONS,
      (request, response) => {
        void (async () => {
          try {
            for await (const chunk of request) {
              // Model Next buffering the complete upload before middleware.
              void chunk;
            }
            if (!response.writableEnded) {
              response.statusCode = 200;
              response.end("unexpected pass-through");
            }
          } catch {
            // The ingress timeout intentionally aborts this request stream.
          }
        })();
      },
    );
    server.on("clientError", handleWebIngressClientError);
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("TEST_PORT_UNAVAILABLE"));
          return;
        }
        resolve(address.port);
      });
    });

    const results = await Promise.all([
      probeSlowUpload(port, "content-length"),
      probeSlowUpload(port, "chunked"),
    ]);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.elapsedMilliseconds).toBeGreaterThanOrEqual(700);
      expect(result.elapsedMilliseconds).toBeLessThan(1_800);
    }
  });

  it("delivers a complete safe body unchanged to the request handler", async () => {
    const server = createHttpServer(
      WEB_INGRESS_SERVER_OPTIONS,
      (request, response) => {
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of request) {
            chunks.push(Buffer.from(chunk));
          }
          response.statusCode = 200;
          response.end(Buffer.concat(chunks));
        })();
      },
    );
    server.on("clientError", handleWebIngressClientError);
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("TEST_PORT_UNAVAILABLE"));
          return;
        }
        resolve(address.port);
      });
    });

    const response = await fetch(`http://${host}:${port}/watchlist`, {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(response.status).toBe(200);
    expect(body).toBe("{}");
  });
});
