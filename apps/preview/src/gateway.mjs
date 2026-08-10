import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Buffer } from "node:buffer";
import { createServer, request as createUpstreamRequest } from "node:http";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

const LOOPBACK_HOST = "127.0.0.1";
const BUILD_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;
const PASSWORD_PATTERN = /^[\x21-\x7e]{1,512}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const EDGE_SUBJECT = "preview-user";
const EDGE_ISSUER = "huoqiu-local-preview";
const DEMO_SESSION_COOKIE =
  "__Secure-huoqiu.session_token=huoqiu-local-preview";
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);
const ALLOW_HEADER_VALUE = "GET, HEAD, POST";
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_REQUEST_TARGET_LENGTH = 4 * 1024;
const MAX_BODY_READ_MILLISECONDS = 1_000;
const MAX_NEXT_ROUTER_STATE_LENGTH = 8 * 1024;
const containsControlCharacter = (value) => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
};
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "range",
  "user-agent",
];
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-encoding",
  "content-language",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
  "vary",
  "x-content-type-options",
  "x-frame-options",
];

const markPreviewResponse = (response, buildSha, gatewaySha) => {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-huoqiu-preview-data", "synthetic");
  response.setHeader("x-huoqiu-preview-review", "unreviewed");
  response.setHeader("x-huoqiu-preview-gateway-sha", gatewaySha);
  response.setHeader("x-huoqiu-preview-product-sha", buildSha);
  response.setHeader("x-huoqiu-preview-sha", buildSha);
  response.setHeader("x-robots-tag", "noindex, nofollow");
};

const reject = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("connection", "close");
  response.end(body);
};

const credentialDigest = (value) =>
  createHash("sha256").update(value, "utf8").digest();

export const credentialsMatch = (received, expected) =>
  timingSafeEqual(credentialDigest(received), credentialDigest(expected));

const singleRawHeaderField = (request, expectedName) => {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === expectedName) {
      values.push(request.rawHeaders[index + 1]);
    }
  }
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : undefined;
};

const singleAuthorizationField = (request) =>
  singleRawHeaderField(request, "authorization");

const parseBasicCredential = (authorization) => {
  const match = /^Basic ([^\s]+)$/u.exec(authorization);
  if (match?.[1] === undefined || !BASE64_PATTERN.test(match[1])) {
    return undefined;
  }

  const decoded = Buffer.from(match[1], "base64");
  if (decoded.toString("base64") !== match[1]) return undefined;
  const plaintext = decoded.toString("utf8");
  if (!Buffer.from(plaintext, "utf8").equals(decoded)) return undefined;
  const separator = plaintext.indexOf(":");
  if (separator <= 0) return undefined;
  return {
    password: plaintext.slice(separator + 1),
    username: plaintext.slice(0, separator),
  };
};

const hasValidAccessCredential = (request, username, password) => {
  const authorization = singleAuthorizationField(request);
  if (authorization === undefined) return false;
  const parsed = parseBasicCredential(authorization);
  const receivedUsername = parsed?.username ?? "";
  const receivedPassword = parsed?.password ?? "";
  const usernameMatches = credentialsMatch(receivedUsername, username);
  const passwordMatches = credentialsMatch(receivedPassword, password);
  return parsed !== undefined && usernameMatches && passwordMatches;
};

const isValidEncodedRouterState = (value) => {
  if (value.length === 0 || value.length > MAX_NEXT_ROUTER_STATE_LENGTH) {
    return false;
  }
  try {
    return Array.isArray(JSON.parse(decodeURIComponent(value)));
  } catch {
    return false;
  }
};

const nextNavigationHeadersFor = (request) => {
  if (singleRawHeaderField(request, "rsc") !== "1") return {};

  const headers = { rsc: "1" };
  const nextUrl = singleRawHeaderField(request, "next-url");
  if (nextUrl !== undefined && safeRequestTarget(nextUrl) !== undefined) {
    headers["next-url"] = nextUrl;
  }

  const routerState = singleRawHeaderField(request, "next-router-state-tree");
  if (routerState !== undefined && isValidEncodedRouterState(routerState)) {
    headers["next-router-state-tree"] = routerState;
  }

  if (singleRawHeaderField(request, "next-router-prefetch") === "1") {
    headers["next-router-prefetch"] = "1";
  }

  const segmentPrefetch = singleRawHeaderField(
    request,
    "next-router-segment-prefetch",
  );
  if (
    segmentPrefetch !== undefined &&
    safeRequestTarget(segmentPrefetch) !== undefined
  ) {
    headers["next-router-segment-prefetch"] = segmentPrefetch;
  }

  return headers;
};

const validateOptions = (options) => {
  if (options === null || typeof options !== "object") {
    throw new Error("PREVIEW_CONFIGURATION_INVALID");
  }
  const {
    buildSha,
    gatewaySha,
    hmacSecret,
    now,
    password,
    upstreamPort,
    username,
  } = options;
  if (
    typeof buildSha !== "string" ||
    !BUILD_SHA_PATTERN.test(buildSha) ||
    (gatewaySha !== undefined &&
      (typeof gatewaySha !== "string" ||
        !BUILD_SHA_PATTERN.test(gatewaySha))) ||
    typeof hmacSecret !== "string" ||
    Buffer.byteLength(hmacSecret, "utf8") < 32 ||
    typeof password !== "string" ||
    !PASSWORD_PATTERN.test(password) ||
    typeof username !== "string" ||
    !USERNAME_PATTERN.test(username) ||
    (now !== undefined && typeof now !== "function") ||
    !Number.isSafeInteger(upstreamPort) ||
    upstreamPort < 1 ||
    upstreamPort > 65_535
  ) {
    throw new Error("PREVIEW_CONFIGURATION_INVALID");
  }
};

const edgeHeadersFor = (request, options, target, body) => {
  const issuedAt = String(Math.floor((options.now ?? Date.now)() / 1000));
  const method = request.method ?? "GET";
  const nonce = randomBytes(16).toString("hex");
  const contentType = request.headers["content-type"] ?? "";
  const bodyLength = String(body.byteLength);
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const canonical = [
    "v2",
    method,
    target,
    EDGE_SUBJECT,
    EDGE_ISSUER,
    "true",
    issuedAt,
    nonce,
    contentType,
    bodyLength,
    bodySha256,
  ].join("\n");
  const signature = createHmac("sha256", options.hmacSecret)
    .update(canonical)
    .digest("hex");
  const headers = {
    cookie: DEMO_SESSION_COOKIE,
    "x-huoqiu-alpha-access": "true",
    "x-huoqiu-edge-body-length": bodyLength,
    "x-huoqiu-edge-body-sha256": bodySha256,
    "x-huoqiu-edge-issued-at": issuedAt,
    "x-huoqiu-edge-issuer": EDGE_ISSUER,
    "x-huoqiu-edge-nonce": nonce,
    "x-huoqiu-edge-signature": `v2=${signature}`,
    "x-huoqiu-edge-subject": EDGE_SUBJECT,
  };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[name];
    if (typeof value === "string") headers[name] = value;
  }
  Object.assign(headers, nextNavigationHeadersFor(request));
  if (body.byteLength > 0) {
    headers["content-length"] = String(body.byteLength);
  }
  return headers;
};

const safeRequestTarget = (rawTarget) => {
  if (
    typeof rawTarget !== "string" ||
    rawTarget.length === 0 ||
    rawTarget.length > MAX_REQUEST_TARGET_LENGTH ||
    !rawTarget.startsWith("/") ||
    rawTarget.startsWith("//") ||
    rawTarget.includes("#") ||
    rawTarget.includes("\\") ||
    containsControlCharacter(rawTarget)
  ) {
    return undefined;
  }

  try {
    const parsed = new URL(rawTarget, "http://preview.invalid");
    const canonical = `${parsed.pathname}${parsed.search}`;
    return parsed.origin === "http://preview.invalid" && canonical === rawTarget
      ? canonical
      : undefined;
  } catch {
    return undefined;
  }
};

const nextVisibleRequestTarget = (target) => {
  const parsed = new URL(target, "http://preview.invalid");
  parsed.searchParams.delete("_rsc");
  return `${parsed.pathname}${parsed.search}`;
};

const readBoundedBody = (request) =>
  new Promise((resolve) => {
    const rawContentLength = request.headers["content-length"];
    if (
      rawContentLength !== undefined &&
      (!/^(?:0|[1-9]\d*)$/u.test(rawContentLength) ||
        Number(rawContentLength) > MAX_REQUEST_BODY_BYTES)
    ) {
      request.resume();
      resolve({ kind: "too-large" });
      return;
    }
    const contentEncoding = request.headers["content-encoding"];
    if (
      contentEncoding !== undefined &&
      contentEncoding.toLowerCase() !== "identity"
    ) {
      request.resume();
      resolve({ kind: "invalid" });
      return;
    }

    const chunks = [];
    let byteLength = 0;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      request.resume();
      finish({ kind: "timeout" });
    }, MAX_BODY_READ_MILLISECONDS);
    request.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > MAX_REQUEST_BODY_BYTES) {
        request.resume();
        finish({ kind: "too-large" });
        return;
      }
      chunks.push(buffer);
    });
    request.once("end", () => {
      finish({ body: Buffer.concat(chunks), kind: "ok" });
    });
    request.once("aborted", () => finish({ kind: "invalid" }));
    request.once("error", () => finish({ kind: "invalid" }));
  });

const copySafeUpstreamHeaders = (upstreamResponse, response) => {
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers[name];
    if (value !== undefined) response.setHeader(name, value);
  }
  const location = upstreamResponse.headers.location;
  if (
    typeof location === "string" &&
    safeRequestTarget(location) !== undefined
  ) {
    response.setHeader("location", location);
  }
};

const parserRejection = (socket, buildSha, gatewaySha) => {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  const body = "Request rejected";
  socket.end(
    [
      "HTTP/1.1 431 Request Header Fields Too Large",
      "Cache-Control: no-store",
      "Connection: close",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Content-Type: text/plain; charset=utf-8",
      "X-Content-Type-Options: nosniff",
      "X-Huoqiu-Preview-Data: synthetic",
      `X-Huoqiu-Preview-Gateway-Sha: ${gatewaySha}`,
      `X-Huoqiu-Preview-Product-Sha: ${buildSha}`,
      "X-Huoqiu-Preview-Review: unreviewed",
      `X-Huoqiu-Preview-Sha: ${buildSha}`,
      "X-Robots-Tag: noindex, nofollow",
      "",
      body,
    ].join("\r\n"),
  );
};

export const createPreviewGateway = (options) => {
  validateOptions(options);
  const gatewaySha = options.gatewaySha ?? options.buildSha;

  const server = createServer(
    {
      connectionsCheckingInterval: 50,
      headersTimeout: 1_000,
      maxHeaderSize: 16 * 1024,
      requestTimeout: 2_000,
    },
    (request, response) => {
      markPreviewResponse(response, options.buildSha, gatewaySha);
      if (
        !hasValidAccessCredential(request, options.username, options.password)
      ) {
        response.setHeader("www-authenticate", 'Basic realm="huoqiu-preview"');
        reject(response, 401, "Unauthorized");
        request.resume();
        return;
      }
      const method = request.method ?? "";
      if (!ALLOWED_METHODS.has(method)) {
        response.setHeader("allow", ALLOW_HEADER_VALUE);
        reject(response, 405, "Method not allowed");
        request.resume();
        return;
      }
      const target = safeRequestTarget(request.url);
      if (target === undefined) {
        reject(response, 400, "Bad request");
        request.resume();
        return;
      }

      void readBoundedBody(request).then((bodyResult) => {
        if (bodyResult.kind === "too-large") {
          reject(response, 413, "Payload too large");
          return;
        }
        if (bodyResult.kind === "timeout") {
          reject(response, 408, "Request timeout");
          return;
        }
        if (
          bodyResult.kind !== "ok" ||
          ((method === "GET" || method === "HEAD") &&
            bodyResult.body.byteLength > 0)
        ) {
          reject(response, 400, "Bad request");
          return;
        }

        const upstreamRequest = createUpstreamRequest(
          {
            headers: edgeHeadersFor(
              request,
              options,
              nextVisibleRequestTarget(target),
              bodyResult.body,
            ),
            host: LOOPBACK_HOST,
            maxHeaderSize: 16 * 1024,
            method,
            path: target,
            port: options.upstreamPort,
          },
          (upstreamResponse) => {
            if ((upstreamResponse.statusCode ?? 500) >= 500) {
              upstreamResponse.resume();
              reject(response, 502, "Preview unavailable");
              return;
            }
            response.statusCode = upstreamResponse.statusCode ?? 502;
            copySafeUpstreamHeaders(upstreamResponse, response);
            markPreviewResponse(response, options.buildSha, gatewaySha);
            upstreamResponse.pipe(response);
          },
        );
        upstreamRequest.once("error", () => {
          if (!response.headersSent) {
            reject(response, 502, "Preview unavailable");
          } else {
            response.destroy();
          }
        });
        upstreamRequest.end(bodyResult.body);
      });
    },
  );
  server.on("clientError", (_error, socket) =>
    parserRejection(socket, options.buildSha, gatewaySha),
  );
  server.on("connect", (_request, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy());
  return server;
};
