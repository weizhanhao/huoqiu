import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath, URL } from "node:url";

import { stampProductBuild } from "../src/provenance.mjs";

const PRODUCT_SHA = "99754f102dc2d8ee49b34dc9e7fd6c13717337ef";
const directories = [];
const stampScript = fileURLToPath(
  new URL("../scripts/stamp-product.mjs", import.meta.url),
);

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const paths = async () => {
  const directory = await mkdtemp(join(tmpdir(), "huoqiu-build-stamp-"));
  directories.push(directory);
  return {
    buildIdPath: join(directory, "BUILD_ID"),
    productShaPath: join(directory, "HUOQIU_PRODUCT_SHA"),
  };
};

describe("approved Web build provenance stamp", () => {
  it("writes only the declared product SHA after seeing a nonempty build ID", async () => {
    const files = await paths();
    await writeFile(files.buildIdPath, "next-build-id\n", "utf8");

    const stamped = await stampProductBuild({
      ...files,
      productSha: PRODUCT_SHA,
    });

    assert.equal(stamped, PRODUCT_SHA);
    assert.equal(
      await readFile(files.productShaPath, "utf8"),
      `${PRODUCT_SHA}\n`,
    );
  });

  it("fails generically when the build ID is absent or the SHA is invalid", async () => {
    const missingBuild = await paths();
    const invalidSha = await paths();
    await writeFile(invalidSha.buildIdPath, "next-build-id\n", "utf8");

    await assert.rejects(
      stampProductBuild({ ...missingBuild, productSha: PRODUCT_SHA }),
      new Error("PREVIEW_BUILD_STAMP_FAILED"),
    );
    await assert.rejects(
      stampProductBuild({ ...invalidSha, productSha: "secret-invalid-value" }),
      new Error("PREVIEW_BUILD_STAMP_FAILED"),
    );
  });

  it("keeps CLI failures generic and does not echo an invalid value", () => {
    const invalidValue = "do-not-echo-invalid-product-sha";
    const result = spawnSync(process.execPath, [stampScript], {
      encoding: "utf8",
      env: { PREVIEW_PRODUCT_SHA: invalidValue },
    });

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "PREVIEW_BUILD_STAMP_FAILED\n");
    assert.doesNotMatch(result.stderr, new RegExp(invalidValue, "u"));
    assert.doesNotMatch(
      result.stderr,
      /MODULE_NOT_FOUND|stack|node:internal/iu,
    );
  });
});
