import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { d0FixtureSchema } from "../src/d0/schema.js";

const loadFixture = (): unknown =>
  JSON.parse(
    readFileSync(new URL("../fixtures/d0.v1.json", import.meta.url), "utf8"),
  );

describe("D0 fixture contract", () => {
  it("parses one versioned, synthetic-only shared fixture", () => {
    const parsed = d0FixtureSchema.parse(loadFixture());

    expect(parsed).toMatchObject({
      version: "d0.v1",
      mode: "fixture",
      seed_user: {
        id: "user_demo_0001",
        name: "演示用户",
        avatar_key: "demo-avatar",
      },
      market: {
        source: "huoqiu-synthetic",
        as_of: "2026-08-08T06:00:00.000Z",
      },
      watchlist: {
        persistence: "session-only",
        listing_ids: [],
      },
    });
    expect(parsed.instruments[0]?.listing_id).toBe("listing_syn_0001");
    expect(parsed.quotes[0]).toMatchObject({
      source: "huoqiu-synthetic",
      stale: false,
      entitlement: "synthetic",
    });
    expect(parsed.feed).toHaveLength(3);
    expect(parsed.feed.every((card) => card.permissions.alpha_access)).toBe(
      true,
    );
  });

  it("rejects unknown top-level fixture fields", () => {
    expect(() =>
      d0FixtureSchema.parse({
        ...(loadFixture() as Record<string, unknown>),
        vendor_payload: { token: "must-not-pass" },
      }),
    ).toThrow();
  });
});
