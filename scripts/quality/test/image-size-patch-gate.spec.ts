import { describe, expect, it } from "vitest";

import {
  dependencyAuditArguments,
  patchedImageSizeAdvisories,
  verifyAuditIgnorePolicy,
  verifyImageSizePatch,
  verifyRemainingDependencyAudit,
} from "../image-size-patch-gate.mts";

describe("locally patched image-size dependency", () => {
  it("rejects non-progressing ICNS and JXL structures within the hard timeout", async () => {
    await expect(verifyImageSizePatch()).resolves.toBeUndefined();
  });

  it("keeps advisory exceptions out of the audit command", () => {
    expect(patchedImageSizeAdvisories).toEqual([
      "GHSA-w3rx-r6r6-pgpr",
      "GHSA-5p2g-fcmc-qvqq",
    ]);
    expect(dependencyAuditArguments()).toEqual([
      "audit",
      "--registry=https://registry.npmjs.org",
      "--audit-level",
      "high",
    ]);
  });

  it("allows exactly the two behaviorally patched advisories in workspace policy", async () => {
    await expect(verifyAuditIgnorePolicy()).resolves.toBeUndefined();
    await expect(
      verifyAuditIgnorePolicy(`
auditConfig:
  ignoreGhsas:
    - GHSA-w3rx-r6r6-pgpr
    - GHSA-5p2g-fcmc-qvqq
    - GHSA-unreviewed-extra
`),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_AUDIT_IGNORE_POLICY_INVALID",
    });
  });

  it("fails closed when the remaining dependency audit reports a vulnerability", async () => {
    await expect(
      verifyRemainingDependencyAudit(async () => {
        throw new Error("synthetic high-severity advisory");
      }),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_AUDIT_HIGH_OR_CRITICAL",
    });
  });
});
