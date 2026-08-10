import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { access } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { describe, it } from "node:test";

import {
  loadLocalPreviewConfiguration,
  startLocalPreview,
} from "../src/local-runtime.mjs";

const host = "127.0.0.1";
const buildIdPath = fileURLToPath(
  new URL("../../web/.next/BUILD_ID", import.meta.url),
);
const webStartScript = fileURLToPath(
  new URL("../../web/scripts/start.mjs", import.meta.url),
);

const availablePort = async () =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      assert.notEqual(address, null);
      assert.equal(typeof address, "object");
      server.close((error) =>
        error === undefined ? resolve(address.port) : reject(error),
      );
    });
  });

const authorization = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

describe("built Web preview integration", () => {
  it("starts the real Web build and serves health plus the protected shell", async () => {
    await access(buildIdPath);
    const [port, webPort] = await Promise.all([
      availablePort(),
      availablePort(),
    ]);
    assert.notEqual(port, webPort);
    const username = "built-preview-reviewer";
    const password = "built-preview-password";
    const configuration = loadLocalPreviewConfiguration({
      argv: ["--port", String(port), "--web-port", String(webPort)],
      environment: {
        APP_ENV: "local",
        PREVIEW_BASIC_PASSWORD: password,
        PREVIEW_BASIC_USERNAME: username,
        PREVIEW_GATEWAY_SHA: "1".repeat(40),
        PREVIEW_PRODUCT_SHA: "2".repeat(40),
      },
    });
    const runtime = await startLocalPreview(configuration, {
      environment: process.env,
      readyTimeoutMilliseconds: 20_000,
      webStartScript,
    });

    try {
      const headers = { authorization: authorization(username, password) };
      const healthResponse = await globalThis.fetch(
        `${runtime.address}/healthz`,
        { headers },
      );
      assert.equal(healthResponse.status, 200);
      assert.equal(await healthResponse.text(), "ok\n");

      const shellResponse = await globalThis.fetch(runtime.address, {
        headers,
      });
      assert.equal(shellResponse.status, 200);
      assert.equal(
        shellResponse.headers.get("x-huoqiu-preview-data"),
        "synthetic",
      );
      assert.equal(
        shellResponse.headers.get("x-huoqiu-preview-review"),
        "unreviewed",
      );
      assert.match(await shellResponse.text(), /火球/u);
    } finally {
      await runtime.close();
    }
  });
});
