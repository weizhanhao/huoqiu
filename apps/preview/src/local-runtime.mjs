import { Buffer } from "node:buffer";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { request as createHttpRequest } from "node:http";
import { dirname } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { parseArgs } from "node:util";

import { createPreviewGateway } from "./gateway.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;
const PASSWORD_PATTERN = /^[\x21-\x7e]{1,512}$/u;
const PORT_PATTERN = /^[1-9]\d{3,4}$/u;
const LOCAL_APP_ENVIRONMENTS = new Set(["local", "development", "test"]);
const LOOPBACK_HOST = "127.0.0.1";
/*
 * 传给 Next 子进程的环境变量白名单。
 *
 * 除了这几项基础的，还必须带上运行期要用的四个 HUOQIU_*：
 *
 * - HUOQIU_SESSION_SECRET 不传，session.ts 的 secret() 直接返回 null，
 *   sessionsAvailable() 为 false——站点跑得起来、页面也正常，但**谁都登不进去**。
 *   这一条在界面上看不出原因，只表现为登录没反应。
 * - 三个目录不传就落在 cwd 下（apps/web/.runtime、apps/web/.huoqiu-store）。
 *   部署时那是代码目录，重新发一版就把账号、帖子和委托流水一起抹掉了。
 *
 * 其余变量一律不透传：子进程拿到的东西越少，越不会依赖启动它的那个 shell。
 */
const FORWARDED_CHILD_ENVIRONMENT = [
  "HOME",
  "HUOQIU_FINANCE_SNAPSHOT_DIRECTORY",
  "HUOQIU_MARKET_CACHE_DIRECTORY",
  "HUOQIU_SESSION_SECRET",
  "HUOQIU_SOCIAL_STORE_DIRECTORY",
  "LANG",
  "LC_ALL",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
];

const configurationFailure = () => new Error("PREVIEW_CONFIGURATION_INVALID");

const parsePort = (rawPort) => {
  if (!PORT_PATTERN.test(rawPort)) throw configurationFailure();
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw configurationFailure();
  }
  return port;
};

export const loadLocalPreviewConfiguration = ({ argv, environment }) => {
  try {
    const { tokens, values } = parseArgs({
      allowPositionals: false,
      args: argv,
      options: {
        hostname: { type: "string" },
        port: { type: "string" },
        "web-port": { type: "string" },
      },
      strict: true,
      tokens: true,
    });
    const optionNames = tokens
      .filter((token) => token.kind === "option")
      .map((token) => token.name);
    if (new Set(optionNames).size !== optionNames.length) {
      throw configurationFailure();
    }
    const hostname = values.hostname ?? "127.0.0.1";
    const port = parsePort(values.port ?? "4173");
    const webPort = parsePort(values["web-port"] ?? "4174");
    const appEnvironment = environment.APP_ENV ?? "local";
    const username = environment.PREVIEW_BASIC_USERNAME;
    const password = environment.PREVIEW_BASIC_PASSWORD;
    const productSha = environment.PREVIEW_PRODUCT_SHA;
    const gatewaySha = environment.PREVIEW_GATEWAY_SHA;

    if (
      hostname !== "127.0.0.1" ||
      port === webPort ||
      !LOCAL_APP_ENVIRONMENTS.has(appEnvironment) ||
      username === undefined ||
      !USERNAME_PATTERN.test(username) ||
      password === undefined ||
      !PASSWORD_PATTERN.test(password) ||
      productSha === undefined ||
      !SHA_PATTERN.test(productSha) ||
      gatewaySha === undefined ||
      !SHA_PATTERN.test(gatewaySha)
    ) {
      throw configurationFailure();
    }

    return Object.freeze({
      gatewaySha,
      hostname,
      password,
      port,
      productSha,
      username,
      webPort,
    });
  } catch {
    throw configurationFailure();
  }
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const healthProofFor = (hmacSecret, challenge) =>
  `v1=${createHmac("sha256", hmacSecret)
    .update(`v1\npreview-health\n${challenge}`)
    .digest("hex")}`;

const exactProofMatch = (received, expected) => {
  if (typeof received !== "string") return false;
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    receivedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
};

const probeWebHealth = (port, hmacSecret, challenge) =>
  new Promise((resolve) => {
    const expectedProof = healthProofFor(hmacSecret, challenge);
    const request = createHttpRequest(
      {
        headers: {
          connection: "close",
          "x-huoqiu-preview-health-challenge": challenge,
        },
        host: LOOPBACK_HOST,
        method: "GET",
        path: "/healthz",
        port,
        timeout: 250,
      },
      (response) => {
        const receivedProof = response.headers["x-huoqiu-preview-health-proof"];
        response.resume();
        response.once("end", () =>
          resolve(
            response.statusCode === 200 &&
              exactProofMatch(receivedProof, expectedProof),
          ),
        );
      },
    );
    request.once("error", () => resolve(false));
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });

const waitForWeb = async (
  child,
  port,
  timeoutMilliseconds,
  hmacSecret,
  challenge,
) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("PREVIEW_START_FAILED");
    }
    if (
      (await probeWebHealth(port, hmacSecret, challenge)) &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      return;
    }
    await delay(50);
  }
  throw new Error("PREVIEW_START_FAILED");
};

/** @returns {Promise<void>} */
const closeGateway = (gateway) =>
  new Promise((resolve) => {
    if (!gateway.listening) {
      resolve();
      return;
    }
    gateway.close(() => resolve());
    gateway.closeAllConnections();
  });

const stopWeb = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
};

/** @returns {Promise<void>} */
const listenGateway = (gateway, port, hostname) =>
  new Promise((resolve, reject) => {
    const onError = () => reject(new Error("PREVIEW_START_FAILED"));
    gateway.once("error", onError);
    gateway.listen(port, hostname, () => {
      gateway.off("error", onError);
      resolve();
    });
  });

const childEnvironmentFor = (environment, hmacSecret) => {
  const childEnvironment = {};
  for (const name of FORWARDED_CHILD_ENVIRONMENT) {
    const value = environment[name];
    if (value !== undefined) childEnvironment[name] = value;
  }
  return {
    ...childEnvironment,
    APP_ENV: "local",
    NODE_ENV: "production",
    ZERO_TRUST_HMAC_SECRET: hmacSecret,
    ZERO_TRUST_ISSUER: "huoqiu-local-preview",
    ZERO_TRUST_MAX_SKEW_SECONDS: "60",
  };
};

export const startLocalPreview = async (
  configuration,
  {
    environment = process.env,
    readyTimeoutMilliseconds = 20_000,
    webStartScript,
  },
) => {
  if (
    typeof webStartScript !== "string" ||
    webStartScript.length === 0 ||
    !Number.isSafeInteger(readyTimeoutMilliseconds) ||
    readyTimeoutMilliseconds < 100 ||
    readyTimeoutMilliseconds > 60_000
  ) {
    throw new Error("PREVIEW_START_FAILED");
  }

  const hmacSecret = randomBytes(32).toString("hex");
  const healthChallenge = randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    [
      webStartScript,
      "--hostname",
      LOOPBACK_HOST,
      "--port",
      String(configuration.webPort),
    ],
    {
      cwd: dirname(dirname(webStartScript)),
      env: childEnvironmentFor(environment, hmacSecret),
      stdio: "ignore",
    },
  );

  let gateway;
  try {
    await waitForWeb(
      child,
      configuration.webPort,
      readyTimeoutMilliseconds,
      hmacSecret,
      healthChallenge,
    );
    gateway = createPreviewGateway({
      buildSha: configuration.productSha,
      gatewaySha: configuration.gatewaySha,
      hmacSecret,
      password: configuration.password,
      upstreamPort: configuration.webPort,
      username: configuration.username,
    });
    await listenGateway(gateway, configuration.port, configuration.hostname);
  } catch {
    if (gateway !== undefined) await closeGateway(gateway);
    await stopWeb(child);
    throw new Error("PREVIEW_START_FAILED");
  }

  let closing = false;
  let closePromise;
  let settleCompletion;
  const completion = new Promise((resolve) => {
    settleCompletion = resolve;
  });
  const handleUnexpectedExit = () => {
    if (closing) return;
    closing = true;
    void closeGateway(gateway).finally(() => {
      settleCompletion({ reason: "web-exit" });
    });
  };
  child.once("exit", handleUnexpectedExit);

  const close = () => {
    if (closePromise !== undefined) return closePromise;
    closing = true;
    child.off("exit", handleUnexpectedExit);
    closePromise = (async () => {
      await closeGateway(gateway);
      await stopWeb(child);
      settleCompletion({ reason: "closed" });
    })();
    return closePromise;
  };

  if (child.exitCode !== null || child.signalCode !== null) {
    handleUnexpectedExit();
  }

  return Object.freeze({
    address: `http://${configuration.hostname}:${configuration.port}`,
    close,
    completion,
    gatewaySha: configuration.gatewaySha,
    productSha: configuration.productSha,
  });
};
