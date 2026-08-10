import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import process from "node:process";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export const stampProductBuild = async ({
  buildIdPath,
  productSha,
  productShaPath,
}) => {
  let temporaryPath;
  try {
    if (!SHA_PATTERN.test(productSha)) {
      throw new Error("INVALID_SHA");
    }
    const buildId = await readFile(buildIdPath, "utf8");
    if (buildId.trim().length === 0) throw new Error("INVALID_BUILD_ID");

    temporaryPath = join(
      dirname(productShaPath),
      `.${basename(productShaPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    await writeFile(temporaryPath, `${productSha}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, productShaPath);
    temporaryPath = undefined;
    return productSha;
  } catch {
    if (temporaryPath !== undefined) {
      await unlink(temporaryPath).catch(() => undefined);
    }
    throw new Error("PREVIEW_BUILD_STAMP_FAILED");
  }
};
