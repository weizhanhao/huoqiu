import { describe, expect, it } from "vitest";

import { capabilityExecutionOptions } from "../run-capability.mts";

describe("capability execution limits", () => {
  it("reserves the protected workflow window for the D0 cross-platform release path", () => {
    expect(capabilityExecutionOptions("d0", "CAP-WATCH-001")).toEqual({
      timeoutMs: 85 * 60 * 1000,
    });
  });

  it("keeps the hardened default for ordinary and future capabilities", () => {
    expect(capabilityExecutionOptions("d0", "CAP-FEED-001")).toEqual({});
    expect(capabilityExecutionOptions("m1", "CAP-WATCH-001")).toEqual({});
  });
});
