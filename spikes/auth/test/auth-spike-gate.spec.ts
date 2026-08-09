import { describe, expect, it } from "vitest";

import {
  auditOutputFromFailure,
  assertCandidatePackageMetadata,
  assertSelectedProvider,
  rootHighOrCriticalAdvisories,
} from "../../../scripts/quality/auth-spike-gate.mts";

describe("auth spike gate", () => {
  it("keeps structured audit JSON when pnpm exits non-zero for unrelated findings", () => {
    expect(
      auditOutputFromFailure({
        message: "audit failed",
        stdout: '{"advisories":{}}',
      }),
    ).toBe('{"advisories":{}}');
    expect(() =>
      auditOutputFromFailure({ message: "network failed", stderr: "offline" }),
    ).toThrow("AUTH_AUDIT_UNAVAILABLE");
  });

  it("allows only the provider selected by the ADR", () => {
    expect(() => assertSelectedProvider("better-auth")).not.toThrow();
    expect(() => assertSelectedProvider("keycloak")).toThrow(
      "AUTH_PROVIDER_NOT_SELECTED",
    );
  });

  it("rejects wrong versions or non-MIT candidate packages", () => {
    expect(() =>
      assertCandidatePackageMetadata([
        { name: "better-auth", version: "1.6.26", license: "MIT" },
        {
          name: "@thallesp/nestjs-better-auth",
          version: "2.7.0",
          license: "MIT",
        },
      ]),
    ).not.toThrow();

    expect(() =>
      assertCandidatePackageMetadata([
        { name: "better-auth", version: "1.6.25", license: "MIT" },
        {
          name: "@thallesp/nestjs-better-auth",
          version: "2.7.0",
          license: "MIT",
        },
      ]),
    ).toThrow("AUTH_CANDIDATE_METADATA_MISMATCH");
  });

  it("fails on High/Critical findings reachable from the root candidate graph", () => {
    const report = {
      advisories: {
        "1": {
          github_advisory_id: "GHSA-root-high",
          module_name: "candidate-child",
          severity: "high",
          findings: [{ paths: [".>better-auth>candidate-child"] }],
        },
        "2": {
          github_advisory_id: "GHSA-mobile-high",
          module_name: "unrelated-mobile-child",
          severity: "critical",
          findings: [{ paths: ["apps__mobile>unrelated-mobile-child"] }],
        },
      },
    };

    expect(rootHighOrCriticalAdvisories(report)).toEqual([
      "GHSA-root-high:candidate-child:high",
    ]);
  });
});
