import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { stampProductBuild } from "../src/provenance.mjs";

try {
  const productSha = await stampProductBuild({
    buildIdPath: fileURLToPath(
      new URL("../../web/.next/BUILD_ID", import.meta.url),
    ),
    productSha: process.env.PREVIEW_PRODUCT_SHA,
    productShaPath: fileURLToPath(
      new URL("../../web/.next/HUOQIU_PRODUCT_SHA", import.meta.url),
    ),
  });
  process.stdout.write(`PREVIEW_PRODUCT_STAMPED ${productSha}\n`);
} catch {
  process.stderr.write("PREVIEW_BUILD_STAMP_FAILED\n");
  process.exit(1);
}
