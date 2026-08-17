import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { stampProductBuild } from "../src/provenance.mjs";

const requestedDistDirectory = process.env.HUOQIU_NEXT_DIST_DIR;
if (
  requestedDistDirectory !== undefined &&
  requestedDistDirectory !== ".next-release"
) {
  process.stderr.write("PREVIEW_BUILD_STAMP_FAILED\n");
  process.exit(1);
}
const distDirectory = requestedDistDirectory ?? ".next";

try {
  const productSha = await stampProductBuild({
    buildIdPath: fileURLToPath(
      new URL(`../../web/${distDirectory}/BUILD_ID`, import.meta.url),
    ),
    productSha: process.env.PREVIEW_PRODUCT_SHA,
    productShaPath: fileURLToPath(
      new URL(`../../web/${distDirectory}/HUOQIU_PRODUCT_SHA`, import.meta.url),
    ),
  });
  process.stdout.write(`PREVIEW_PRODUCT_STAMPED ${productSha}\n`);
} catch {
  process.stderr.write("PREVIEW_BUILD_STAMP_FAILED\n");
  process.exit(1);
}
