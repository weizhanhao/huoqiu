import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

const ADMIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BODY_UPLOAD_DEADLINE_MILLISECONDS = 1000;
const DEADLINE_TOLERANCE_MILLISECONDS = 600;
const STARTUP_TIMEOUT_MILLISECONDS = 10_000;
const ZERO_TRUST_ISSUER = "huoqiu-zero-trust";
const ZERO_TRUST_SECRET = "0123456789abcdef0123456789abcdef";
const SENSITIVE_MARKERS = [
  "ingress-cookie-must-not-leak",
  "ingress-body-must-not-leak",
  "ingress-header-must-not-leak",
];

const unusedPort = async () =>
  new Promise((resolvePort, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (address === null || typeof address === "string") {
        reservation.close();
        reject(new Error("ADMIN_INGRESS_PORT_ALLOCATION_FAILED"));
        return;
      }

      reservation.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolvePort(address.port);
        }
      });
    });
  });

const canConnect = async (port) =>
  new Promise((resolveConnection) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolveConnection(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(50, () => finish(false));
  });

const waitUntilListening = async (port, child) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MILLISECONDS) {
    if (child.exitCode !== null) {
      throw new Error("ADMIN_INGRESS_SERVER_EXITED_BEFORE_LISTEN");
    }
    if (await canConnect(port)) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error("ADMIN_INGRESS_SERVER_START_TIMEOUT");
};

const stopProcessGroup = (child) => {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
};

const proofHeaders = ({ authorization, method, path, signatureOverride }) => {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const subject = "employee-ingress-proof";
  const alphaAccess = "true";
  const canonical = [
    "v1",
    method,
    path,
    subject,
    ZERO_TRUST_ISSUER,
    alphaAccess,
    issuedAt,
  ].join("\n");
  const signature =
    signatureOverride ??
    `v1=${createHmac("sha256", ZERO_TRUST_SECRET)
      .update(canonical)
      .digest("hex")}`;

  return [
    `Cookie: __Secure-huoqiu.session_token=${SENSITIVE_MARKERS[0]}`,
    ...(authorization === undefined ? [] : [`Authorization: ${authorization}`]),
    `x-huoqiu-alpha-access: ${alphaAccess}`,
    `x-huoqiu-edge-issued-at: ${issuedAt}`,
    `x-huoqiu-edge-issuer: ${ZERO_TRUST_ISSUER}`,
    `x-huoqiu-edge-signature: ${signature}`,
    `x-huoqiu-edge-subject: ${subject}`,
  ];
};

const requestHead = ({
  authorization,
  contentLength,
  contentType,
  path = "/admin",
  signatureOverride,
}) =>
  [
    `POST ${path} HTTP/1.1`,
    "Host: 127.0.0.1",
    "Connection: close",
    ...(contentLength === undefined
      ? []
      : [`Content-Length: ${String(contentLength)}`]),
    ...(contentType === undefined ? [] : [`Content-Type: ${contentType}`]),
    ...proofHeaders({
      authorization,
      method: "POST",
      path,
      signatureOverride,
    }),
    "",
    "",
  ].join("\r\n");

const rawRequest = async ({
  head,
  initialBody = "",
  port,
  releaseDelayMilliseconds,
  remainingBody = "",
  timeoutMilliseconds = 3000,
}) =>
  new Promise((resolveResult) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const startedAt = Date.now();
    let response = "";
    let settled = false;
    let releaseTimer;

    const finish = (timedOut) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (releaseTimer !== undefined) {
        clearTimeout(releaseTimer);
      }
      const statusMatch = /^HTTP\/1\.1 (\d{3})/u.exec(response);
      socket.destroy();
      resolveResult({
        elapsedMilliseconds: Date.now() - startedAt,
        response,
        status: statusMatch === null ? undefined : Number(statusMatch[1]),
        timedOut,
      });
    };

    const timeout = setTimeout(() => finish(true), timeoutMilliseconds);
    socket.once("error", (error) => {
      if (settled) {
        return;
      }
      if (response.length > 0) {
        finish(false);
      } else {
        settled = true;
        clearTimeout(timeout);
        resolveResult({
          elapsedMilliseconds: Date.now() - startedAt,
          response,
          status: undefined,
          timedOut: false,
        });
      }
      if (!socket.destroyed) {
        socket.destroy(error);
      }
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("\r\n\r\n")) {
        finish(false);
      }
    });
    socket.once("close", () => finish(false));
    socket.once("connect", () => {
      socket.write(`${head}${initialBody}`);
      if (releaseDelayMilliseconds !== undefined) {
        releaseTimer = setTimeout(
          () => socket.write(remainingBody),
          releaseDelayMilliseconds,
        );
      }
    });
  });

const failures = [];

const expectDownstream = (name, result) => {
  if (result.timedOut || result.status !== 405) {
    failures.push(`ADMIN_INGRESS_${name}_DID_NOT_REACH_DOWNSTREAM`);
  }
};

const expectDeadline = (name, result) => {
  if (
    result.timedOut ||
    (result.status !== undefined && result.status !== 403) ||
    result.elapsedMilliseconds >
      BODY_UPLOAD_DEADLINE_MILLISECONDS + DEADLINE_TOLERANCE_MILLISECONDS
  ) {
    failures.push(`ADMIN_INGRESS_${name}_DEADLINE_FAILED`);
  }
};

const port = await unusedPort();
const packageJson = JSON.parse(
  await readFile(resolve(ADMIN_ROOT, "package.json"), "utf8"),
);
const startCommand = packageJson.scripts?.start;
if (typeof startCommand !== "string") {
  throw new Error("ADMIN_INGRESS_START_SCRIPT_MISSING");
}
const child = spawn(
  "/bin/sh",
  ["-c", `${startCommand} --hostname 127.0.0.1 --port ${String(port)}`],
  {
    cwd: ADMIN_ROOT,
    detached: true,
    env: {
      ...process.env,
      APP_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PATH: `${resolve(ADMIN_ROOT, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
      ZERO_TRUST_HMAC_SECRET: ZERO_TRUST_SECRET,
      ZERO_TRUST_ISSUER,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
child.stdout?.on("data", (chunk) => {
  serverOutput += chunk.toString("utf8");
});
child.stderr?.on("data", (chunk) => {
  serverOutput += chunk.toString("utf8");
});

try {
  await waitUntilListening(port, child);

  const bodyless = await rawRequest({ head: requestHead({}), port });
  expectDownstream("BODYLESS", bodyless);

  const zeroLength = await rawRequest({
    head: requestHead({ contentLength: 0 }),
    port,
  });
  expectDownstream("ZERO_LENGTH", zeroLength);

  const completeBody = JSON.stringify({ operation: "approve" });
  const fastBody = await rawRequest({
    head: requestHead({
      contentLength: Buffer.byteLength(completeBody),
      contentType: "application/json",
    }),
    initialBody: completeBody,
    port,
  });
  expectDownstream("FAST_BODY", fastBody);

  const delayedBody =
    JSON.stringify({ operation: "approve" }) +
    " ".repeat(
      100 - Buffer.byteLength(JSON.stringify({ operation: "approve" })),
    );
  const delayedCompleteBody = await rawRequest({
    head: requestHead({
      contentLength: Buffer.byteLength(delayedBody),
      contentType: "application/json",
    }),
    initialBody: delayedBody.slice(0, 5),
    port,
    releaseDelayMilliseconds: 500,
    remainingBody: delayedBody.slice(5),
  });
  expectDownstream("DELAYED_COMPLETE_BODY", delayedCompleteBody);

  const declaredBodyLength = 100;
  const partialBody = SENSITIVE_MARKERS[1].slice(0, 5);
  const deadlineTimeout =
    BODY_UPLOAD_DEADLINE_MILLISECONDS + DEADLINE_TOLERANCE_MILLISECONDS;
  const slowResults = await Promise.all([
    rawRequest({
      head: requestHead({
        contentLength: declaredBodyLength,
        contentType: "application/json",
      }),
      initialBody: partialBody,
      port,
      timeoutMilliseconds: deadlineTimeout,
    }),
    rawRequest({
      head: requestHead({
        contentLength: declaredBodyLength,
        contentType: "application/json",
        signatureOverride: `v1=${"0".repeat(64)}`,
      }),
      initialBody: partialBody,
      port,
      timeoutMilliseconds: deadlineTimeout,
    }),
    rawRequest({
      head: requestHead({
        authorization: `Bearer ${SENSITIVE_MARKERS[2]}`,
        contentLength: declaredBodyLength,
        contentType: "application/json",
      }),
      initialBody: partialBody,
      port,
      timeoutMilliseconds: deadlineTimeout,
    }),
    rawRequest({
      head: requestHead({
        contentLength: declaredBodyLength,
        contentType: "text/plain",
      }),
      initialBody: partialBody,
      port,
      timeoutMilliseconds: deadlineTimeout,
    }),
  ]);

  for (const [index, result] of slowResults.entries()) {
    expectDeadline(`SLOW_${String(index + 1)}`, result);
  }

  const serializedEvidence = [
    serverOutput,
    bodyless.response,
    zeroLength.response,
    fastBody.response,
    delayedCompleteBody.response,
    ...slowResults.map((result) => result.response),
  ].join("\n");
  for (const marker of [...SENSITIVE_MARKERS, partialBody]) {
    if (serializedEvidence.includes(marker)) {
      failures.push("ADMIN_INGRESS_SECRET_LEAKED");
    }
  }
  if (
    /ADMIN_INGRESS_START_FAILED|Internal Server Error|Unhandled/u.test(
      serverOutput,
    )
  ) {
    failures.push("ADMIN_INGRESS_SERVER_ERROR_OUTPUT");
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const deadlineEvidence = slowResults
    .map(
      (result, index) =>
        `slow_${String(index + 1)}=${result.status ?? "closed"}@${String(result.elapsedMilliseconds)}ms`,
    )
    .join(",");
  process.stdout.write(
    [
      `bodyless=${String(bodyless.status)}`,
      `zero_length=${String(zeroLength.status)}`,
      `fast_body=${String(fastBody.status)}`,
      `delayed_complete=${String(delayedCompleteBody.status)}@${String(delayedCompleteBody.elapsedMilliseconds)}ms`,
      deadlineEvidence,
      "ADMIN_INGRESS_HTTP_OK",
    ].join("\n") + "\n",
  );
} finally {
  stopProcessGroup(child);
}
