import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

import { getRequestHandlers } from "next/dist/server/lib/start-server.js";

const BODY_UPLOAD_DEADLINE_MILLISECONDS = 1000;
const INGRESS_BODYLESS_PROOF_HEADER = "x-huoqiu-ingress-bodyless-proof";
const START_ERROR = "ADMIN_INGRESS_START_FAILED";
const STATE_CHANGING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

const containsControlCharacter = (value) =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
    );
  });

const parseArguments = (argumentsList, environment) => {
  let hostname = "0.0.0.0";
  let port = environment.PORT ?? "3000";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];
    if (argument === "--hostname" || argument === "-H") {
      if (value === undefined) {
        throw new Error(START_ERROR);
      }
      hostname = value;
      index += 1;
      continue;
    }
    if (argument === "--port" || argument === "-p") {
      if (value === undefined) {
        throw new Error(START_ERROR);
      }
      port = value;
      index += 1;
      continue;
    }
    throw new Error(START_ERROR);
  }

  const parsedPort = Number(port);
  if (
    hostname.length === 0 ||
    containsControlCharacter(hostname) ||
    !/^[1-9]\d*$/u.test(String(port)) ||
    !Number.isSafeInteger(parsedPort) ||
    parsedPort > 65_535
  ) {
    throw new Error(START_ERROR);
  }

  return { hostname, port: parsedPort };
};

const hasDeclaredRequestBody = (request) => {
  if (request.headers["transfer-encoding"] !== undefined) {
    return true;
  }

  const rawContentLength = request.headers["content-length"];
  return rawContentLength !== undefined && rawContentLength !== "0";
};

const attestBodylessRequest = (request) => {
  const secret = process.env.ZERO_TRUST_HMAC_SECRET;
  if (secret === undefined) {
    throw new Error(START_ERROR);
  }

  const canonical = [
    "huoqiu-ingress-bodyless-v1",
    request.method?.toUpperCase() ?? "",
    request.url ?? "",
    "bodyless",
  ].join("\n");
  request.headers[INGRESS_BODYLESS_PROOF_HEADER] =
    `v1=${createHmac("sha256", secret).update(canonical).digest("hex")}`;
};

const enforceUploadDeadline = (request, response) => {
  const deadline = setTimeout(() => {
    request.destroy();
    response.destroy();
  }, BODY_UPLOAD_DEADLINE_MILLISECONDS);
  deadline.unref();

  const clearDeadline = () => clearTimeout(deadline);
  request.once("aborted", clearDeadline);
  request.once("end", clearDeadline);
  request.once("error", clearDeadline);
  response.once("close", clearDeadline);
};

const prepareIngressRequest = (request, response) => {
  Reflect.deleteProperty(request.headers, INGRESS_BODYLESS_PROOF_HEADER);
  if (!STATE_CHANGING_METHODS.has(request.method?.toUpperCase() ?? "")) {
    return;
  }

  if (hasDeclaredRequestBody(request)) {
    enforceUploadDeadline(request, response);
  } else {
    attestBodylessRequest(request);
  }
};

const start = async () => {
  const { hostname, port } = parseArguments(process.argv.slice(2), process.env);
  process.env.PORT = String(port);
  process.env.__NEXT_PRIVATE_ORIGIN = `http://${hostname}:${String(port)}`;

  let resolveHandlers;
  let rejectHandlers;
  const handlersPromise = new Promise((resolve, reject) => {
    resolveHandlers = resolve;
    rejectHandlers = reject;
  });
  void handlersPromise.catch(() => undefined);

  const server = createServer(async (request, response) => {
    prepareIngressRequest(request, response);
    try {
      const handlers = await handlersPromise;
      await handlers.requestHandler(request, response);
    } catch {
      if (request.destroyed || response.destroyed || response.writableEnded) {
        return;
      }
      response.writeHead(500, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Internal Server Error");
    }
  });

  server.on("upgrade", async (request, socket, head) => {
    try {
      const handlers = await handlersPromise;
      await handlers.upgradeHandler(request, socket, head);
    } catch {
      socket.destroy();
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, hostname, () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });

  let handlers;
  try {
    handlers = await getRequestHandlers({
      dir: process.cwd(),
      experimentalHttpsServer: false,
      hostname,
      isDev: false,
      keepAliveTimeout: undefined,
      minimalMode: false,
      onDevServerCleanup: undefined,
      port,
      quiet: true,
      server,
      serverFastRefresh: undefined,
    });
    resolveHandlers(handlers);
  } catch (error) {
    rejectHandlers(error);
    server.close();
    throw error;
  }

  const shutdown = () => {
    server.close(() => {
      void Promise.resolve(handlers.server?.close()).finally(() =>
        process.exit(0),
      );
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.on("error", () => {
    process.stderr.write(`${START_ERROR}\n`);
    process.exitCode = 1;
  });
  process.stdout.write(`Admin server ready on ${hostname}:${String(port)}\n`);
};

try {
  await start();
} catch {
  process.stderr.write(`${START_ERROR}\n`);
  process.exitCode = 1;
}
