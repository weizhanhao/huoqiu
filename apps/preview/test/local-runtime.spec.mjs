import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, describe, it } from "node:test";

import {
  loadLocalPreviewConfiguration,
  startLocalPreview,
} from "../src/local-runtime.mjs";

const validEnvironment = {
  APP_ENV: "local",
  PREVIEW_BASIC_PASSWORD: "correct-horse-battery-staple",
  PREVIEW_BASIC_USERNAME: "previewer",
  PREVIEW_GATEWAY_SHA: "1111111111111111111111111111111111111111",
  PREVIEW_PRODUCT_SHA: "99754f102dc2d8ee49b34dc9e7fd6c13717337ef",
};

const resources = [];

afterEach(async () => {
  while (resources.length > 0) {
    await resources.pop()();
  }
});

const availablePort = async () =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.notEqual(address, null);
      assert.equal(typeof address, "object");
      server.close((error) =>
        error === undefined ? resolve(address.port) : reject(error),
      );
    });
  });

const basicAuthorization = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

const dummyWebScript = async () => {
  const directory = await mkdtemp(join(tmpdir(), "huoqiu-preview-runtime-"));
  resources.push(() => rm(directory, { force: true, recursive: true }));
  const scriptsDirectory = join(directory, "scripts");
  await mkdir(scriptsDirectory);
  const scriptPath = join(scriptsDirectory, "web.mjs");
  await writeFile(
    scriptPath,
    `
      import { createServer } from "node:http";
      import { createHmac } from "node:crypto";
      const portIndex = process.argv.indexOf("--port");
      const hostIndex = process.argv.indexOf("--hostname");
      const port = Number(process.argv[portIndex + 1]);
      const hostname = process.argv[hostIndex + 1];
      const server = createServer((request, response) => {
        if (request.url === "/exit") process.exit(7);
        if (request.url === "/healthz") {
          const challenge = request.headers["x-huoqiu-preview-health-challenge"];
          if (typeof challenge === "string") {
            const proof = createHmac(
              "sha256",
              process.env.ZERO_TRUST_HMAC_SECRET,
            )
              .update("v1\\npreview-health\\n" + challenge)
              .digest("hex");
            response.setHeader("x-huoqiu-preview-health-proof", "v1=" + proof);
          }
          response.statusCode = 200;
          response.end("ok");
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          appEnv: process.env.APP_ENV,
          cwd: process.cwd(),
          hasBasicPassword: process.env.PREVIEW_BASIC_PASSWORD !== undefined,
          hasUnrelatedSecret: process.env.UNRELATED_SECRET !== undefined,
          headers: request.headers,
          hmacLength: process.env.ZERO_TRUST_HMAC_SECRET?.length,
          nodeEnv: process.env.NODE_ENV,
        }));
      });
      server.listen(port, hostname);
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
          server.close(() => process.exit(0));
          server.closeAllConnections();
        });
      }
    `,
    "utf8",
  );
  return { appRoot: await realpath(directory), scriptPath };
};

const runtimeFixture = async () => {
  const [port, webPort] = await Promise.all([availablePort(), availablePort()]);
  assert.notEqual(port, webPort);
  const configuration = loadLocalPreviewConfiguration({
    argv: ["--port", String(port), "--web-port", String(webPort)],
    environment: validEnvironment,
  });
  const { appRoot, scriptPath: webStartScript } = await dummyWebScript();
  const runtime = await startLocalPreview(configuration, {
    environment: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      PREVIEW_BASIC_PASSWORD: validEnvironment.PREVIEW_BASIC_PASSWORD,
      TMPDIR: process.env.TMPDIR,
      UNRELATED_SECRET: "must-not-reach-Web",
    },
    readyTimeoutMilliseconds: 2_000,
    webStartScript,
  });
  resources.push(() => runtime.close());
  return { appRoot, configuration, runtime };
};

describe("local preview startup configuration", () => {
  it("uses distinct loopback-only default ports", () => {
    const configuration = loadLocalPreviewConfiguration({
      argv: [],
      environment: validEnvironment,
    });

    assert.deepEqual(configuration, {
      gatewaySha: validEnvironment.PREVIEW_GATEWAY_SHA,
      hostname: "127.0.0.1",
      password: validEnvironment.PREVIEW_BASIC_PASSWORD,
      port: 4173,
      productSha: validEnvironment.PREVIEW_PRODUCT_SHA,
      username: validEnvironment.PREVIEW_BASIC_USERNAME,
      webPort: 4174,
    });
  });

  for (const [label, override] of [
    ["missing username", { PREVIEW_BASIC_USERNAME: undefined }],
    ["empty username", { PREVIEW_BASIC_USERNAME: "" }],
    ["missing password", { PREVIEW_BASIC_PASSWORD: undefined }],
    ["empty password", { PREVIEW_BASIC_PASSWORD: "" }],
    ["production classification", { APP_ENV: "production" }],
    ["staging classification", { APP_ENV: "staging" }],
    ["unknown classification", { APP_ENV: "preview-production" }],
    ["missing product SHA", { PREVIEW_PRODUCT_SHA: undefined }],
    ["mixed-case gateway SHA", { PREVIEW_GATEWAY_SHA: "A".repeat(40) }],
  ]) {
    it(`rejects ${label} without echoing configuration values`, () => {
      const secret = override.PREVIEW_BASIC_PASSWORD || "do-not-echo";
      assert.throws(
        () =>
          loadLocalPreviewConfiguration({
            argv: [],
            environment: { ...validEnvironment, ...override },
          }),
        (error) => {
          assert.equal(error.message, "PREVIEW_CONFIGURATION_INVALID");
          assert.doesNotMatch(error.message, new RegExp(secret, "u"));
          return true;
        },
      );
    });
  }

  for (const [label, argv] of [
    ["public bind", ["--hostname", "0.0.0.0"]],
    ["name bind", ["--hostname", "localhost"]],
    ["privileged port", ["--port", "80"]],
    ["ambiguous port", ["--port", "04173"]],
    ["colliding ports", ["--port", "4174", "--web-port", "4174"]],
    ["duplicate port", ["--port", "4173", "--port", "5173"]],
    ["unknown option", ["--upstream-host", "attacker.invalid"]],
  ]) {
    it(`rejects ${label}`, () => {
      assert.throws(
        () =>
          loadLocalPreviewConfiguration({
            argv,
            environment: validEnvironment,
          }),
        new Error("PREVIEW_CONFIGURATION_INVALID"),
      );
    });
  }

  it("accepts only an explicit loopback bind and valid distinct high ports", () => {
    const configuration = loadLocalPreviewConfiguration({
      argv: ["--hostname", "127.0.0.1", "--port", "5173", "--web-port", "5174"],
      environment: validEnvironment,
    });

    assert.equal(configuration.hostname, "127.0.0.1");
    assert.equal(configuration.port, 5173);
    assert.equal(configuration.webPort, 5174);
  });
});

describe("local preview process lifecycle", () => {
  it("starts Web before the protected gateway without exposing in-memory secrets", async () => {
    const { appRoot, configuration, runtime } = await runtimeFixture();

    const response = await globalThis.fetch(runtime.address, {
      headers: {
        authorization: basicAuthorization(
          configuration.username,
          configuration.password,
        ),
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(runtime.address, `http://127.0.0.1:${configuration.port}`);
    assert.equal(
      response.headers.get("x-huoqiu-preview-sha"),
      configuration.productSha,
    );
    assert.equal(
      response.headers.get("x-huoqiu-preview-gateway-sha"),
      configuration.gatewaySha,
    );
    assert.equal(body.appEnv, "local");
    assert.equal(body.cwd, appRoot);
    assert.equal(body.nodeEnv, "production");
    assert.equal(body.hasBasicPassword, false);
    assert.equal(body.hasUnrelatedSecret, false);
    assert.equal(body.hmacLength, 64);
    assert.equal(body.headers["x-huoqiu-edge-issuer"], "huoqiu-local-preview");
    assert.equal("hmacSecret" in runtime, false);

    await runtime.close();
    await runtime.close();
    assert.deepEqual(await runtime.completion, { reason: "closed" });
    await assert.rejects(globalThis.fetch(runtime.address));
  });

  it("closes the gateway if the Web child exits unexpectedly", async () => {
    const { configuration, runtime } = await runtimeFixture();
    const authorization = basicAuthorization(
      configuration.username,
      configuration.password,
    );

    await globalThis
      .fetch(`${runtime.address}/exit`, {
        headers: { authorization },
      })
      .catch(() => undefined);

    assert.deepEqual(await runtime.completion, { reason: "web-exit" });
    await assert.rejects(
      globalThis.fetch(runtime.address, { headers: { authorization } }),
    );
  });

  it("does not trust an unrelated process that preoccupies the Web port", async () => {
    const [port, webPort] = await Promise.all([
      availablePort(),
      availablePort(),
    ]);
    const occupant = createHttpServer((_request, response) => {
      response.statusCode = 200;
      response.end("not-the-preview-child");
    });
    await new Promise((resolve, reject) => {
      occupant.once("error", reject);
      occupant.listen(webPort, "127.0.0.1", () => {
        occupant.off("error", reject);
        resolve();
      });
    });
    resources.push(
      () =>
        new Promise((resolve) => {
          occupant.close(() => resolve());
          occupant.closeAllConnections();
        }),
    );
    const configuration = loadLocalPreviewConfiguration({
      argv: ["--port", String(port), "--web-port", String(webPort)],
      environment: validEnvironment,
    });
    const { scriptPath: webStartScript } = await dummyWebScript();

    await assert.rejects(
      startLocalPreview(configuration, {
        environment: process.env,
        readyTimeoutMilliseconds: 1_000,
        webStartScript,
      }),
      new Error("PREVIEW_START_FAILED"),
    );
    await assert.rejects(globalThis.fetch(`http://127.0.0.1:${port}`));
  });
});
