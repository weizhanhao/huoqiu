import { describe, expect, it } from "vitest";

import {
  dependencyAuditArguments,
  patchedImageSizeAdvisories,
  verifyImageSizePatch,
} from "../image-size-patch-gate.mts";

describe("locally patched image-size dependency", () => {
  it("rejects non-progressing ICNS and JXL structures within the hard timeout", async () => {
    await expect(verifyImageSizePatch()).resolves.toBeUndefined();
  });

  it("allows audit exceptions only for the two behaviorally patched advisories", () => {
    expect(patchedImageSizeAdvisories).toEqual([
      "GHSA-w3rx-r6r6-pgpr",
      "GHSA-5p2g-fcmc-qvqq",
    ]);
    expect(dependencyAuditArguments()).toEqual([
      "audit",
      "--registry=https://registry.npmjs.org",
      "--audit-level",
      "high",
      "--ignore",
      "GHSA-w3rx-r6r6-pgpr",
      "--ignore",
      "GHSA-5p2g-fcmc-qvqq",
    ]);
  });
});
