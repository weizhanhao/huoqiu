import { createServer } from "node:http";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { parseArgs } from "node:util";

import {
  handleWebIngressClientError,
  WEB_INGRESS_SERVER_OPTIONS,
} from "../src/upload-ingress.ts";
import { assertZeroTrustStartupConfiguration } from "../src/zero-trust-configuration.ts";

const nodeEnvironment = process.env.NODE_ENV ?? "production";
const environment = {
  ...process.env,
  NODE_ENV: nodeEnvironment,
};
process.env.NODE_ENV = nodeEnvironment;

try {
  assertZeroTrustStartupConfiguration(environment);
} catch {
  process.stderr.write("ZERO_TRUST_CONFIGURATION_INVALID\n");
  process.exit(1);
}

let hostname;
let port;
try {
  const { values } = parseArgs({
    allowPositionals: false,
    args: process.argv.slice(2),
    options: {
      hostname: { short: "H", type: "string" },
      port: { short: "p", type: "string" },
    },
    strict: true,
  });
  hostname = values.hostname ?? "0.0.0.0";
  const rawPort = values.port ?? process.env.PORT ?? "3000";
  port = Number(rawPort);
  if (
    hostname.length === 0 ||
    /\s/u.test(hostname) ||
    !/^[1-9]\d{0,4}$/u.test(rawPort) ||
    !Number.isSafeInteger(port) ||
    port > 65_535
  ) {
    throw new Error("INVALID_START_ARGUMENTS");
  }
} catch {
  process.stderr.write("WEB_START_ARGUMENTS_INVALID\n");
  process.exit(1);
}

const appRoot = fileURLToPath(new URL("../", import.meta.url));
let application;
let server;
try {
  const { default: createNextApplication } = await import("next");
  application = createNextApplication({
    dev: false,
    dir: appRoot,
    hostname,
    port,
  });
  await application.prepare();
  const handle = application.getRequestHandler();
  server = createServer(WEB_INGRESS_SERVER_OPTIONS, (request, response) => {
    void Promise.resolve(handle(request, response)).catch(() => {
      if (response.writableEnded || response.destroyed) return;
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.statusCode = 500;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader("x-content-type-options", "nosniff");
      response.end("Internal Server Error");
    });
  });
  server.on("clientError", handleWebIngressClientError);

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(port, hostname, () => {
      server.off("error", onError);
      resolve();
    });
  });
  process.stdout.write(`Web ready on http://${hostname}:${port}\n`);
} catch {
  process.stderr.write("WEB_START_FAILED\n");
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
    void application.close().finally(() => process.exit(0));
  });
}
