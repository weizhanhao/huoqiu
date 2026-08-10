import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import {
  loadLocalPreviewConfiguration,
  startLocalPreview,
} from "../src/local-runtime.mjs";

let configuration;
try {
  configuration = loadLocalPreviewConfiguration({
    argv: process.argv.slice(2),
    environment: process.env,
  });
} catch {
  process.stderr.write("PREVIEW_CONFIGURATION_INVALID\n");
  process.exit(1);
}

const buildIdPath = fileURLToPath(
  new URL("../../web/.next/BUILD_ID", import.meta.url),
);
const productShaPath = fileURLToPath(
  new URL("../../web/.next/HUOQIU_PRODUCT_SHA", import.meta.url),
);
const webStartScript = fileURLToPath(
  new URL("../../web/scripts/start.mjs", import.meta.url),
);

try {
  const [buildId, productSha] = await Promise.all([
    readFile(buildIdPath, "utf8"),
    readFile(productShaPath, "utf8"),
  ]);
  if (
    buildId.trim().length === 0 ||
    productSha.trim() !== configuration.productSha
  ) {
    throw new Error("PREVIEW_BUILD_INVALID");
  }
} catch {
  process.stderr.write("PREVIEW_BUILD_MISSING\n");
  process.exit(1);
}

let runtime;
try {
  runtime = await startLocalPreview(configuration, {
    environment: process.env,
    webStartScript,
  });
} catch {
  process.stderr.write("PREVIEW_START_FAILED\n");
  process.exit(1);
}

process.stdout.write(
  [
    `PREVIEW_READY ${runtime.address}`,
    `PREVIEW_PRODUCT_SHA ${runtime.productSha}`,
    `PREVIEW_GATEWAY_SHA ${runtime.gatewaySha}`,
    "PREVIEW_DATA synthetic",
    "PREVIEW_REVIEW unreviewed",
  ].join("\n") + "\n",
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void runtime.close();
  });
}

const completion = await runtime.completion;
if (completion.reason === "web-exit") {
  process.stderr.write("PREVIEW_WEB_EXITED\n");
  process.exitCode = 1;
}
