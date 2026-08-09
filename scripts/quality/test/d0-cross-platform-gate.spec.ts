import { describe, expect, it, vi } from "vitest";

import { runD0CrossPlatformEvidence } from "../d0-cross-platform-gate.mts";

describe("D0 cross-platform release evidence", () => {
  it("requires Web repeat-3 plus one real iOS and Android flow in order", async () => {
    const order: string[] = [];
    const summary = await runD0CrossPlatformEvidence({
      runMobile: vi.fn(async (platform) => {
        order.push(platform);
        return { failed: 0, passed: 1, skipped: 0 };
      }),
      runWeb: vi.fn(async () => {
        order.push("web");
        return { failed: 0, passed: 3, skipped: 0 };
      }),
    });

    expect(order).toEqual(["web", "ios", "android"]);
    expect(summary).toEqual({ failed: 0, passed: 5, skipped: 0 });
  });

  it.each(["web", "ios", "android"] as const)(
    "fails closed when %s is not verified",
    async (failedTarget) => {
      await expect(
        runD0CrossPlatformEvidence({
          runMobile: async (platform) =>
            platform === failedTarget
              ? { failed: 1, passed: 0, skipped: 0 }
              : { failed: 0, passed: 1, skipped: 0 },
          runWeb: async () =>
            failedTarget === "web"
              ? { failed: 1, passed: 0, skipped: 0 }
              : { failed: 0, passed: 3, skipped: 0 },
        }),
      ).rejects.toThrow("D0_CROSS_PLATFORM_NOT_VERIFIED");
    },
  );

  it("rejects skip, missing, or inflated counters", async () => {
    await expect(
      runD0CrossPlatformEvidence({
        runMobile: async () => ({ failed: 0, passed: 2, skipped: 0 }),
        runWeb: async () => ({ failed: 0, passed: 3, skipped: 0 }),
      }),
    ).rejects.toThrow("D0_CROSS_PLATFORM_NOT_VERIFIED");
  });
});
