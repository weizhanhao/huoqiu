import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { d0FixtureSchema } from "../src/d0/schema.js";
import { feedCardV1Schema } from "../src/feed/card-v1.js";

const loadFixture = (): unknown =>
  JSON.parse(
    readFileSync(new URL("../fixtures/d0.v1.json", import.meta.url), "utf8"),
  );

const validCard = {
  type: "post",
  schema_version: 1,
  card_id: "card_demo_post_0001",
  published_at: "2026-08-08T05:58:00.000Z",
  source: "huoqiu-synthetic",
  permissions: {
    alpha_access: true,
    visibility: "alpha-public",
  },
  payload: {
    author_name: "演示研究员",
    title: "合成市场观察",
    body: "本内容仅用于功能演示。",
  },
} as const;

describe("Feed Card v1 contract", () => {
  it("accepts only the bounded v1 public card envelope", () => {
    expect(feedCardV1Schema.parse(validCard)).toEqual(validCard);
  });

  it.each([
    { ...validCard, type: "unknown_card" },
    { ...validCard, schema_version: 2 },
    { ...validCard, internal_rank: 99 },
    {
      ...validCard,
      permissions: { ...validCard.permissions, alpha_access: false },
    },
    {
      ...validCard,
      permissions: { ...validCard.permissions, internal_role: "admin" },
    },
  ])("rejects unknown or unapproved card input", (candidate) => {
    expect(() => feedCardV1Schema.parse(candidate)).toThrow();
  });

  it("keeps one market strip plus two content cards in the shared fixture", () => {
    const parsed = d0FixtureSchema.parse(loadFixture());

    expect(parsed.feed.map((card) => card.type)).toEqual([
      "market_strip",
      "post",
      "news",
    ]);
    expect(new Set(parsed.feed.map((card) => card.card_id)).size).toBe(3);
    expect(
      parsed.feed.every((card) => card.source === "huoqiu-synthetic"),
    ).toBe(true);
  });
});
