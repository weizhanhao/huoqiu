import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer as createNetServer } from "node:net";
import { afterEach, describe, it } from "node:test";

import { createPreviewGateway, credentialsMatch } from "../src/gateway.mjs";

const HOST = "127.0.0.1";
const BASIC_USERNAME = "previewer";
const BASIC_PASSWORD = "correct-horse-battery-staple";
const BUILD_SHA = "99754f102dc2d8ee49b34dc9e7fd6c13717337ef";
const HMAC_SECRET = "0123456789abcdef0123456789abcdef";
const FIXED_NOW = 1_800_000_000_000;
const DEMO_SESSION_COOKIE =
  "__Secure-huoqiu.session_token=huoqiu-local-preview";

const listeningServers = new Set();

const listen = async (server) => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  listeningServers.add(server);
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address.port;
};

const close = async (server) => {
  listeningServers.delete(server);
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections?.();
  });
};

afterEach(async () => {
  await Promise.all([...listeningServers].map(close));
});

const basicAuthorization = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

const fixture = async () => {
  let upstreamRequests = 0;
  const upstream = createHttpServer((_request, response) => {
    upstreamRequests += 1;
    response.statusCode = 200;
    response.end("approved-web");
  });
  const upstreamPort = await listen(upstream);
  const gateway = createPreviewGateway({
    buildSha: BUILD_SHA,
    hmacSecret: HMAC_SECRET,
    password: BASIC_PASSWORD,
    upstreamPort,
    username: BASIC_USERNAME,
  });
  const gatewayPort = await listen(gateway);
  return {
    gateway,
    gatewayPort,
    upstream,
    upstreamRequests: () => upstreamRequests,
  };
};

const capturingFixture = async () => {
  let capture;
  const upstream = createHttpServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      capture = {
        body: Buffer.concat(chunks).toString("utf8"),
        headers: request.headers,
        method: request.method,
        rawHeaders: request.rawHeaders,
        url: request.url,
      };
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(capture));
    });
  });
  const upstreamPort = await listen(upstream);
  const gateway = createPreviewGateway({
    buildSha: BUILD_SHA,
    hmacSecret: HMAC_SECRET,
    now: () => FIXED_NOW,
    password: BASIC_PASSWORD,
    upstreamPort,
    username: BASIC_USERNAME,
  });
  const gatewayPort = await listen(gateway);
  return {
    capture: () => capture,
    gateway,
    gatewayPort,
    upstream,
    upstreamPort,
  };
};

const rawRequest = async (port, request) =>
  new Promise((resolve, reject) => {
    const socket = connect({ host: HOST, port }, () => socket.end(request));
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.once("end", () => resolve(response));
    socket.once("error", reject);
  });

const availablePort = async () => {
  const server = createNetServer();
  const port = await listen(server);
  await close(server);
  return port;
};

const authenticatedHeaders = (extra = {}) => ({
  authorization: basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD),
  ...extra,
});

const customFixture = async (handler) => {
  const upstream = createHttpServer(handler);
  const upstreamPort = await listen(upstream);
  const gateway = createPreviewGateway({
    buildSha: BUILD_SHA,
    hmacSecret: HMAC_SECRET,
    now: () => FIXED_NOW,
    password: BASIC_PASSWORD,
    upstreamPort,
    username: BASIC_USERNAME,
  });
  const gatewayPort = await listen(gateway);
  return { gateway, gatewayPort, upstream, upstreamPort };
};

describe("local preview Basic access boundary", () => {
  it("rejects incomplete gateway configuration without echoing values", () => {
    assert.throws(
      () =>
        createPreviewGateway({
          buildSha: BUILD_SHA,
          hmacSecret: undefined,
          password: BASIC_PASSWORD,
          upstreamPort: 4174,
          username: BASIC_USERNAME,
        }),
      new Error("PREVIEW_CONFIGURATION_INVALID"),
    );
  });

  it("compares different-length credential candidates without throwing", () => {
    assert.equal(credentialsMatch("a", "a-much-longer-value"), false);
    assert.equal(credentialsMatch("same", "same"), true);
  });

  it("rejects missing and incorrect credentials without touching the upstream", async () => {
    const preview = await fixture();

    const missing = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
    );
    const wrong = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
      {
        headers: { authorization: basicAuthorization(BASIC_USERNAME, "wrong") },
      },
    );

    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(await missing.text(), "Unauthorized");
    assert.equal(await wrong.text(), "Unauthorized");
    assert.equal(preview.upstreamRequests(), 0);
  });

  it("rejects duplicate Authorization fields as ambiguous", async () => {
    const preview = await fixture();
    const credential = basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD);

    const response = await rawRequest(
      preview.gatewayPort,
      [
        "GET / HTTP/1.1",
        `Host: ${HOST}:${preview.gatewayPort}`,
        `Authorization: ${credential}`,
        `Authorization: ${credential}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );

    assert.match(response, /^HTTP\/1\.1 401 Unauthorized/mu);
    assert.equal(preview.upstreamRequests(), 0);
  });

  it("proxies a request carrying exactly one correct credential", async () => {
    const preview = await fixture();

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
      {
        headers: {
          authorization: basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD),
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "approved-web");
    assert.equal(preview.upstreamRequests(), 1);
  });
});

describe("preview-to-Web trust boundary", () => {
  it("consumes browser credentials and forged edge headers before injecting one proof", async () => {
    const preview = await capturingFixture();
    const target = "/search?q=SYN001";

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}${target}`,
      {
        headers: {
          accept: "text/html",
          authorization: basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD),
          cookie: "attacker-session=do-not-forward",
          "x-forwarded-host": "attacker.invalid",
          "x-huoqiu-alpha-access": "false",
          "x-huoqiu-edge-issued-at": "1",
          "x-huoqiu-edge-issuer": "attacker.invalid",
          "x-huoqiu-edge-body-length": "999",
          "x-huoqiu-edge-body-sha256": "0".repeat(64),
          "x-huoqiu-edge-nonce": "0".repeat(32),
          "x-huoqiu-edge-signature": `v2=${"0".repeat(64)}`,
          "x-huoqiu-edge-subject": "attacker",
          "x-huoqiu-preview-sha": "forged",
        },
      },
    );
    const received = await response.json();
    const issuedAt = String(FIXED_NOW / 1000);
    const bodySha256 = createHash("sha256").update("").digest("hex");
    const nonce = received.headers["x-huoqiu-edge-nonce"];
    assert.equal(typeof nonce, "string");
    assert.match(nonce, /^[0-9a-f]{32}$/u);
    const canonical = [
      "v2",
      "GET",
      target,
      "preview-user",
      "huoqiu-local-preview",
      "true",
      issuedAt,
      nonce,
      "",
      "0",
      bodySha256,
    ].join("\n");
    const expectedSignature = `v2=${createHmac("sha256", HMAC_SECRET)
      .update(canonical)
      .digest("hex")}`;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-huoqiu-preview-sha"), BUILD_SHA);
    assert.equal(response.headers.get("x-huoqiu-preview-data"), "synthetic");
    assert.equal(response.headers.get("x-huoqiu-preview-review"), "unreviewed");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(received.method, "GET");
    assert.equal(received.url, target);
    assert.equal(received.headers.accept, "text/html");
    assert.equal(received.headers.authorization, undefined);
    assert.equal(received.headers.cookie, DEMO_SESSION_COOKIE);
    assert.equal(received.headers["x-forwarded-host"], undefined);
    assert.equal(received.headers["x-huoqiu-edge-subject"], "preview-user");
    assert.equal(
      received.headers["x-huoqiu-edge-issuer"],
      "huoqiu-local-preview",
    );
    assert.equal(received.headers["x-huoqiu-alpha-access"], "true");
    assert.equal(received.headers["x-huoqiu-edge-issued-at"], issuedAt);
    assert.equal(received.headers["x-huoqiu-edge-body-length"], "0");
    assert.equal(received.headers["x-huoqiu-edge-body-sha256"], bodySha256);
    assert.equal(
      received.headers["x-huoqiu-edge-signature"],
      expectedSignature,
    );
    assert.equal(received.headers["x-huoqiu-preview-sha"], undefined);
    assert.equal(received.headers.host, `${HOST}:${preview.upstreamPort}`);
    for (const protectedName of [
      "authorization",
      "cookie",
      "x-huoqiu-alpha-access",
      "x-huoqiu-edge-body-length",
      "x-huoqiu-edge-body-sha256",
      "x-huoqiu-edge-issued-at",
      "x-huoqiu-edge-issuer",
      "x-huoqiu-edge-nonce",
      "x-huoqiu-edge-signature",
      "x-huoqiu-edge-subject",
    ]) {
      const occurrences = received.rawHeaders.filter(
        (value, index) =>
          index % 2 === 0 && value.toLowerCase() === protectedName,
      );
      assert.equal(
        occurrences.length,
        protectedName === "authorization" ? 0 : 1,
      );
    }
  });

  it("signs the target exactly as Next exposes it after removing its RSC cache key", async () => {
    const preview = await capturingFixture();
    const target = "/search?q=a%20b&_rsc=browser-cache-buster";

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}${target}`,
      { headers: authenticatedHeaders() },
    );
    const received = await response.json();
    const issuedAt = String(FIXED_NOW / 1000);
    const bodySha256 = createHash("sha256").update("").digest("hex");
    const nonce = received.headers["x-huoqiu-edge-nonce"];
    assert.equal(typeof nonce, "string");
    const canonical = [
      "v2",
      "GET",
      "/search?q=a+b",
      "preview-user",
      "huoqiu-local-preview",
      "true",
      issuedAt,
      nonce,
      "",
      "0",
      bodySha256,
    ].join("\n");
    const expectedSignature = `v2=${createHmac("sha256", HMAC_SECRET)
      .update(canonical)
      .digest("hex")}`;

    assert.equal(response.status, 200);
    assert.equal(received.url, target);
    assert.equal(
      received.headers["x-huoqiu-edge-signature"],
      expectedSignature,
    );
  });

  it("preserves the single-valued Next RSC navigation contract", async () => {
    const preview = await capturingFixture();
    const routerState = encodeURIComponent(
      JSON.stringify(["", { children: ["markets", {}] }, null, null, true]),
    );
    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/watchlist?_rsc=cache-buster`,
      {
        headers: authenticatedHeaders({
          "next-router-prefetch": "1",
          "next-router-segment-prefetch": "/_tree",
          "next-router-state-tree": routerState,
          "next-url": "/markets",
          rsc: "1",
        }),
      },
    );
    const received = await response.json();

    assert.equal(response.status, 200);
    assert.equal(received.headers.rsc, "1");
    assert.equal(received.headers["next-router-state-tree"], routerState);
    assert.equal(received.headers["next-router-prefetch"], "1");
    assert.equal(received.headers["next-router-segment-prefetch"], "/_tree");
    assert.equal(received.headers["next-url"], "/markets");
  });

  it("drops malformed Next navigation metadata", async () => {
    let receivedHeaders;
    const preview = await customFixture((request, response) => {
      receivedHeaders = request.headers;
      response.statusCode = 200;
      response.end("safe-upstream");
    });
    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/watchlist?_rsc=cache-buster`,
      {
        headers: authenticatedHeaders({
          "next-router-prefetch": "0",
          "next-router-segment-prefetch": "https://attacker.invalid/tree",
          "next-router-state-tree": "not-json",
          "next-url": "https://attacker.invalid/markets",
          rsc: "1, 1",
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "safe-upstream");
    assert.notEqual(receivedHeaders, undefined);
    assert.equal(receivedHeaders.rsc, undefined);
    assert.equal(receivedHeaders["next-router-prefetch"], undefined);
    assert.equal(receivedHeaders["next-router-segment-prefetch"], undefined);
    assert.equal(receivedHeaders["next-router-state-tree"], undefined);
    assert.equal(receivedHeaders["next-url"], undefined);
  });

  it("binds each POST proof to its body, content type, and a fresh nonce", async () => {
    const preview = await capturingFixture();
    const target = "/watchlist";
    const body = JSON.stringify({ note: "synthetic body" });
    const request = () =>
      globalThis.fetch(`http://${HOST}:${preview.gatewayPort}${target}`, {
        body,
        headers: authenticatedHeaders({ "content-type": "application/json" }),
        method: "POST",
      });

    const first = await (await request()).json();
    const second = await (await request()).json();
    const bodySha256 = createHash("sha256").update(body).digest("hex");
    const bodyLength = String(Buffer.byteLength(body));

    for (const received of [first, second]) {
      const nonce = received.headers["x-huoqiu-edge-nonce"];
      const issuedAt = received.headers["x-huoqiu-edge-issued-at"];
      assert.equal(typeof nonce, "string");
      assert.match(nonce, /^[0-9a-f]{32}$/u);
      assert.equal(received.headers["x-huoqiu-edge-body-length"], bodyLength);
      assert.equal(received.headers["x-huoqiu-edge-body-sha256"], bodySha256);
      const canonical = [
        "v2",
        "POST",
        target,
        "preview-user",
        "huoqiu-local-preview",
        "true",
        issuedAt,
        nonce,
        "application/json",
        bodyLength,
        bodySha256,
      ].join("\n");
      const expectedSignature = `v2=${createHmac("sha256", HMAC_SECRET)
        .update(canonical)
        .digest("hex")}`;
      assert.equal(
        received.headers["x-huoqiu-edge-signature"],
        expectedSignature,
      );
    }

    assert.notEqual(
      first.headers["x-huoqiu-edge-nonce"],
      second.headers["x-huoqiu-edge-nonce"],
    );
    assert.notEqual(
      first.headers["x-huoqiu-edge-signature"],
      second.headers["x-huoqiu-edge-signature"],
    );
  });
});

describe("preview request limits", () => {
  it("rejects methods outside the local read-and-form allowlist", async () => {
    const preview = await capturingFixture();

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
      {
        headers: authenticatedHeaders(),
        method: "PUT",
      },
    );

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD, POST");
    assert.equal(preview.capture(), undefined);
  });

  it("rejects absolute-form targets instead of treating them as proxy destinations", async () => {
    const preview = await capturingFixture();
    const credential = basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD);

    const response = await rawRequest(
      preview.gatewayPort,
      [
        "GET http://attacker.invalid/private HTTP/1.1",
        `Host: ${HOST}:${preview.gatewayPort}`,
        `Authorization: ${credential}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );

    assert.match(response, /^HTTP\/1\.1 400 Bad Request/mu);
    assert.equal(preview.capture(), undefined);
  });

  it("rejects a request body above 8 KiB before contacting Web", async () => {
    const preview = await capturingFixture();

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/post`,
      {
        body: "x".repeat(8 * 1024 + 1),
        headers: authenticatedHeaders({ "content-type": "text/plain" }),
        method: "POST",
      },
    );

    assert.equal(response.status, 413);
    assert.equal(preview.capture(), undefined);
  });

  it("forwards a bounded request body with a recomputed length", async () => {
    const preview = await capturingFixture();
    const body = JSON.stringify({ message: "synthetic preview" });

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/post`,
      {
        body,
        headers: authenticatedHeaders({ "content-type": "application/json" }),
        method: "POST",
      },
    );
    const received = await response.json();

    assert.equal(response.status, 200);
    assert.equal(received.body, body);
    assert.equal(
      received.headers["content-length"],
      String(Buffer.byteLength(body)),
    );
    assert.equal(received.headers["transfer-encoding"], undefined);
  });

  it("fails closed on an oversized header without disclosing parser details", async () => {
    const preview = await capturingFixture();
    const credential = basicAuthorization(BASIC_USERNAME, BASIC_PASSWORD);

    const response = await rawRequest(
      preview.gatewayPort,
      [
        "GET / HTTP/1.1",
        `Host: ${HOST}:${preview.gatewayPort}`,
        `Authorization: ${credential}`,
        `X-Oversized: ${"x".repeat(17 * 1024)}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );

    assert.match(response, /^HTTP\/1\.1 431 Request Header Fields Too Large/mu);
    assert.doesNotMatch(response, /HPE_HEADER_OVERFLOW|stack|node:internal/iu);
    assert.equal(preview.capture(), undefined);
  });
});

describe("preview response boundary", () => {
  it("forwards only canonical same-origin redirect locations", async () => {
    const preview = await customFixture((request, response) => {
      response.statusCode = 307;
      response.setHeader(
        "location",
        request.url === "/safe"
          ? "/watchlist?_rsc=safe-cache-key"
          : "https://attacker.invalid/escape",
      );
      response.end();
    });

    const safe = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/safe`,
      { headers: authenticatedHeaders(), redirect: "manual" },
    );
    const external = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/external`,
      { headers: authenticatedHeaders(), redirect: "manual" },
    );

    assert.equal(safe.status, 307);
    assert.equal(
      safe.headers.get("location"),
      "/watchlist?_rsc=safe-cache-key",
    );
    assert.equal(external.status, 307);
    assert.equal(external.headers.get("location"), null);
  });

  it("drops upstream credentials and forged preview or edge metadata", async () => {
    const preview = await customFixture((_request, response) => {
      response.statusCode = 200;
      response.setHeader("authorization", "Bearer upstream-secret");
      response.setHeader("cache-control", "public, max-age=3600");
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader("set-cookie", "real-session=must-not-leave-upstream");
      response.setHeader("x-huoqiu-edge-subject", "forged-upstream");
      response.setHeader("x-huoqiu-preview-sha", "forged-upstream");
      response.end("safe-body");
    });

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
      {
        headers: authenticatedHeaders(),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "safe-body");
    assert.equal(response.headers.get("authorization"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-huoqiu-edge-subject"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-huoqiu-preview-sha"), BUILD_SHA);
  });

  it("replaces an upstream 5xx body with a generic preview failure", async () => {
    const preview = await customFixture((_request, response) => {
      response.statusCode = 500;
      response.setHeader("x-private-error", "database-secret");
      response.end("database-secret in upstream body");
    });

    const response = await globalThis.fetch(
      `http://${HOST}:${preview.gatewayPort}/`,
      {
        headers: authenticatedHeaders(),
      },
    );
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.equal(body, "Preview unavailable");
    assert.equal(response.headers.get("x-private-error"), null);
    assert.doesNotMatch(body, /database|secret/iu);
  });

  it("returns a generic marked failure when the fixed loopback upstream is unavailable", async () => {
    const upstreamPort = await availablePort();
    const gateway = createPreviewGateway({
      buildSha: BUILD_SHA,
      hmacSecret: HMAC_SECRET,
      password: BASIC_PASSWORD,
      upstreamPort,
      username: BASIC_USERNAME,
    });
    const gatewayPort = await listen(gateway);

    const response = await globalThis.fetch(
      `http://${HOST}:${gatewayPort}/private`,
      {
        headers: authenticatedHeaders(),
      },
    );
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.equal(body, "Preview unavailable");
    assert.equal(response.headers.get("x-huoqiu-preview-sha"), BUILD_SHA);
    assert.doesNotMatch(body, new RegExp(String(upstreamPort), "u"));
    assert.doesNotMatch(body, /ECONNREFUSED|127\.0\.0\.1|secret/iu);
  });
});
