import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

import { assertZeroTrustStartupConfiguration } from "../src/zero-trust-configuration.ts";

const environment = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
};

try {
  assertZeroTrustStartupConfiguration(environment);
} catch {
  process.stderr.write("ZERO_TRUST_CONFIGURATION_INVALID\n");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextCli, "start", ...process.argv.slice(2)],
  {
    env: environment,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("error", () => {
  process.stderr.write("WEB_START_FAILED\n");
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
