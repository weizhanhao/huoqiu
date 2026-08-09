import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ADMIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIGURATION_ERROR = "ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED";
const SECRET_MARKERS = [
  "preflight-cookie-must-not-leak",
  "preflight-invite-must-not-leak",
  "preflight-signature-must-not-leak",
] as const;

type SpawnResult = Readonly<{
  didListen: boolean;
  exitCode: number | null;
  output: string;
}>;

const packageScripts = async (): Promise<Record<string, string>> => {
  const packageJson: unknown = JSON.parse(
    await readFile(resolve(ADMIN_ROOT, "package.json"), "utf8"),
  );
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("scripts" in packageJson) ||
    typeof packageJson.scripts !== "object" ||
    packageJson.scripts === null
  ) {
    throw new Error("ADMIN_TEST_PACKAGE_SCRIPTS_MISSING");
  }

  return packageJson.scripts as Record<string, string>;
};

const unusedPort = async (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("ADMIN_TEST_PORT_ALLOCATION_FAILED"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolvePort(address.port);
        }
      });
    });
  });

const acceptsConnections = async (port: number): Promise<boolean> =>
  new Promise((resolveConnection) => {
    let settled = false;
    const finish = (connected: boolean): void => {
      if (!settled) {
        settled = true;
        resolveConnection(connected);
      }
    };
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      finish(true);
    });
    socket.once("error", () => finish(false));
    socket.setTimeout(25, () => {
      socket.destroy();
      finish(false);
    });
  });

const stopProcessGroup = (child: ChildProcess): void => {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
};

const spawnPackageStart = async (
  appEnvironment: "production" | "staging",
): Promise<SpawnResult> => {
  const scripts = await packageScripts();
  const startCommand = scripts.start;
  if (startCommand === undefined) {
    throw new Error("ADMIN_TEST_START_SCRIPT_MISSING");
  }

  const port = await unusedPort();
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    APP_ENV: appEnvironment,
    HUOQIU_TEST_COOKIE: SECRET_MARKERS[0],
    HUOQIU_TEST_INVITE: SECRET_MARKERS[1],
    HUOQIU_TEST_SIGNATURE: SECRET_MARKERS[2],
    NEXT_TELEMETRY_DISABLED: "1",
    PATH: `${resolve(ADMIN_ROOT, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
    PORT: String(port),
    ZERO_TRUST_HMAC_SECRET: SECRET_MARKERS[2],
  };
  delete environment.ZERO_TRUST_ISSUER;
  delete environment.ZERO_TRUST_MAX_SKEW_SECONDS;

  const child = spawn(
    "/bin/sh",
    ["-c", `${startCommand} --hostname 127.0.0.1 --port ${String(port)}`],
    {
      cwd: ADMIN_ROOT,
      detached: true,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let didListen = false;
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });

  const monitor = setInterval(() => {
    void acceptsConnections(port).then((connected) => {
      if (connected) {
        didListen = true;
        stopProcessGroup(child);
      }
    });
  }, 5);

  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      stopProcessGroup(child);
      reject(new Error("ADMIN_TEST_START_TIMEOUT"));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
  }).finally(() => clearInterval(monitor));

  return { didListen, exitCode, output };
};

const spawnPreflight = async (): Promise<SpawnResult> => {
  const child = spawn(
    process.execPath,
    [resolve(ADMIN_ROOT, "scripts/zero-trust-preflight.mjs")],
    {
      cwd: ADMIN_ROOT,
      env: {
        ...process.env,
        APP_ENV: "test",
        ZERO_TRUST_HMAC_SECRET: "0123456789abcdef0123456789abcdef",
        ZERO_TRUST_ISSUER: "huoqiu-zero-trust",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  });

  return { didListen: false, exitCode, output };
};

describe("admin Zero Trust process preflight", () => {
  it("uses the same independent synchronous preflight for build and start", async () => {
    const scripts = await packageScripts();

    expect(scripts.build).toMatch(
      /^node scripts\/zero-trust-preflight\.mjs && /u,
    );
    expect(scripts.start).toMatch(
      /^node scripts\/zero-trust-preflight\.mjs && /u,
    );
  });

  it.each(["production", "staging"] as const)(
    "exits non-zero before next start can listen in %s without configuration",
    async (appEnvironment) => {
      const result = await spawnPackageStart(appEnvironment);

      expect(result.exitCode).not.toBe(0);
      expect(result.didListen).toBe(false);
      expect(result.output).toContain(CONFIGURATION_ERROR);
      for (const marker of SECRET_MARKERS) {
        expect(result.output).not.toContain(marker);
      }
    },
  );

  it("accepts an explicitly configured non-production verification run", async () => {
    const result = await spawnPreflight();

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("");
  });
});
