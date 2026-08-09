import { describe, expect, it } from "vitest";

import {
  auditOutputFromFailure,
  assertCandidatePackageMetadata,
  assertNodeRuntime,
  assertPassingVitestReport,
  assertSelectedProvider,
  rootHighOrCriticalAdvisories,
} from "../../../scripts/quality/auth-spike-gate.mts";

describe("auth spike gate", () => {
  it("rejects runtimes outside the root Node 24 range", () => {
    expect(() =>
      assertNodeRuntime("v24.15.0", ">=24.15.0 <25", "24.15.0"),
    ).not.toThrow();
    expect(() =>
      assertNodeRuntime("v24.99.0", ">=24.15.0 <25", "24.15.0"),
    ).not.toThrow();
    expect(() =>
      assertNodeRuntime("v23.11.0", ">=24.15.0 <25", "24.15.0"),
    ).toThrow("AUTH_NODE_RUNTIME_UNSUPPORTED");
    expect(() =>
      assertNodeRuntime("v25.0.0", ">=24.15.0 <25", "24.15.0"),
    ).toThrow("AUTH_NODE_RUNTIME_UNSUPPORTED");
  });

  it("requires the root engine and nvm declarations to match the approved range", () => {
    expect(() =>
      assertNodeRuntime("v24.15.0", ">=24.0.0 <25", "24.15.0"),
    ).toThrow("AUTH_NODE_DECLARATION_MISMATCH");
    expect(() =>
      assertNodeRuntime("v24.15.0", ">=24.15.0 <25", "24.14.0"),
    ).toThrow("AUTH_NODE_DECLARATION_MISMATCH");
  });

  it("accepts only a non-empty all-passing Vitest JSON report", () => {
    const passing = JSON.stringify({
      numFailedTests: 0,
      numPassedTests: 3,
      numPendingTests: 0,
      numTodoTests: 0,
      numTotalTests: 3,
      success: true,
    });
    expect(() => assertPassingVitestReport(passing, "root")).not.toThrow();

    for (const report of [
      {
        numFailedTests: 0,
        numPassedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTests: 0,
        success: true,
      },
      {
        numFailedTests: 0,
        numPassedTests: 2,
        numPendingTests: 1,
        numTodoTests: 0,
        numTotalTests: 3,
        success: true,
      },
      {
        numFailedTests: 0,
        numPassedTests: 0,
        numPendingTests: 3,
        numTodoTests: 0,
        numTotalTests: 3,
        success: true,
      },
      {
        numFailedTests: 0,
        numPassedTests: 2,
        numPendingTests: 0,
        numTodoTests: 1,
        numTotalTests: 3,
        success: true,
      },
      {
        numFailedTests: 1,
        numPassedTests: 2,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTests: 3,
        success: false,
      },
    ]) {
      expect(() =>
        assertPassingVitestReport(JSON.stringify(report), "root"),
      ).toThrow("AUTH_TESTS_NOT_ALL_PASSED");
    }
    expect(() => assertPassingVitestReport("not-json", "mobile")).toThrow(
      "AUTH_VITEST_REPORT_INVALID",
    );
  });

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

  it("fails closed when High/Critical advisory findings or paths are malformed", () => {
    const advisory = {
      github_advisory_id: "GHSA-malformed",
      module_name: "candidate-child",
      severity: "high",
    };
    for (const malformed of [
      advisory,
      { ...advisory, findings: "missing" },
      { ...advisory, findings: [] },
      { ...advisory, findings: [{}] },
      { ...advisory, findings: [{ paths: "missing" }] },
      { ...advisory, findings: [{ paths: [] }] },
      { ...advisory, findings: [{ paths: [42] }] },
      {
        ...advisory,
        findings: [{ paths: [".>candidate-child"] }, {}],
      },
    ]) {
      expect(() =>
        rootHighOrCriticalAdvisories({ advisories: { "1": malformed } }),
      ).toThrow("AUTH_AUDIT_INVALID");
    }
  });
});
