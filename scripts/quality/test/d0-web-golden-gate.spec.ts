import { describe, expect, it } from "vitest";

import {
  playwrightArguments,
  summarizePlaywrightReport,
} from "../d0-web-golden-gate.mts";

describe("D0 Web golden evidence", () => {
  it("pins the production golden path to three deterministic Chromium runs", () => {
    expect(playwrightArguments()).toEqual([
      "test",
      "-c",
      "tests/e2e/playwright.config.ts",
      "tests/e2e/playwright/d0/golden.spec.ts",
      "--project=chromium",
      "--repeat-each=3",
      "--workers=1",
      "--reporter=json",
    ]);
  });

  it("accepts exactly three expected runs without skip, retry, or failure", () => {
    expect(
      summarizePlaywrightReport(
        JSON.stringify({
          errors: [],
          stats: {
            expected: 3,
            flaky: 0,
            skipped: 0,
            unexpected: 0,
          },
        }),
      ),
    ).toEqual({ failed: 0, passed: 3, skipped: 0 });
  });

  it.each([
    ["no tests", { expected: 0, flaky: 0, skipped: 0, unexpected: 0 }],
    ["skip", { expected: 2, flaky: 0, skipped: 1, unexpected: 0 }],
    ["flaky", { expected: 3, flaky: 1, skipped: 0, unexpected: 0 }],
    ["failure", { expected: 2, flaky: 0, skipped: 0, unexpected: 1 }],
  ])("rejects %s evidence", (_name, stats) => {
    expect(() =>
      summarizePlaywrightReport(JSON.stringify({ errors: [], stats })),
    ).toThrow("D0_WEB_NOT_VERIFIED");
  });

  it("rejects malformed or runner-error reports", () => {
    expect(() => summarizePlaywrightReport("not-json")).toThrow(
      "D0_WEB_NOT_VERIFIED",
    );
    expect(() =>
      summarizePlaywrightReport(
        JSON.stringify({ errors: [{ message: "browser crashed" }], stats: {} }),
      ),
    ).toThrow("D0_WEB_NOT_VERIFIED");
  });
});
