import { describe, expect, it } from "vitest";

import { resourceIdSchema } from "../src/m1/common.js";
import { barSchema, quoteSchema } from "../src/m1/instrument.contract.js";
import { notificationSchema } from "../src/m1/notification-moderation.contract.js";
import { m1Router } from "../src/m1/router.js";

const validQuote = {
  listing_id: "listing_US_AAPL",
  price: "189.25",
  change: "1.50",
  change_percent: "0.80",
  as_of: "2026-08-09T08:00:00Z",
  exchange_timezone: "America/New_York",
  stale: false,
  source: "huoqiu-synthetic",
  entitlement: "synthetic",
  sequence: "42",
  revision: "7",
} as const;

const validBar = {
  starts_at: "2026-08-08T04:00:00Z",
  open: "188.00",
  high: "190.00",
  low: "187.50",
  close: "189.25",
  volume: "1234567",
  source: "huoqiu-synthetic",
  as_of: "2026-08-09T08:00:00Z",
  exchange_timezone: "America/New_York",
  sequence: "42",
  revision: "7",
  entitlement: "synthetic",
} as const;

const validNotification = {
  id: "notification_01J00000000000000000000000",
  sequence: "42",
  kind: "post_published",
  title: "Post published",
  body: "Your post is visible.",
  created_at: "2026-08-09T08:00:00Z",
  deep_link: "/posts/post_01J00000000000000000000000",
} as const;

describe("M1 market and watchlist integration boundaries", () => {
  it("requires complete synthetic-provider provenance on quotes and bars", () => {
    expect(quoteSchema.safeParse(validQuote).success).toBe(true);
    expect(barSchema.safeParse(validBar).success).toBe(true);

    expect(
      quoteSchema.safeParse({ ...validQuote, source: "synthetic" }).success,
    ).toBe(false);
    expect(
      barSchema.safeParse({ ...validBar, source: "synthetic" }).success,
    ).toBe(false);

    for (const field of [
      "as_of",
      "exchange_timezone",
      "sequence",
      "revision",
      "entitlement",
    ] as const) {
      expect(
        quoteSchema.safeParse({ ...validQuote, [field]: undefined }).success,
        `quote.${field}`,
      ).toBe(false);
      expect(
        barSchema.safeParse({ ...validBar, [field]: undefined }).success,
        `bar.${field}`,
      ).toBe(false);
    }

    expect(
      quoteSchema.safeParse({ ...validQuote, entitlement: "allowed" }).success,
    ).toBe(false);
    expect(
      barSchema.safeParse({ ...validBar, entitlement: "delayed" }).success,
    ).toBe(false);
  });

  it("exposes only the currently committed 1d bars interval", () => {
    expect(
      m1Router.listingGetBars.query.safeParse({ interval: "1d" }).success,
    ).toBe(true);
    for (const interval of ["1m", "5m", "15m", "1h"] as const) {
      expect(
        m1Router.listingGetBars.query.safeParse({ interval }).success,
        interval,
      ).toBe(false);
    }
  });

  it("returns the committed int64 version from watchlist PUT", () => {
    const responseSchema = m1Router.watchlistPutItem.responses[200];
    const response = {
      request_id: "request_1",
      trace_id: "trace_1",
      item: {
        listing_id: "listing_US_AAPL",
        added_at: "2026-08-09T08:00:00Z",
      },
      committed_version: "9223372036854775807",
    } as const;

    expect(responseSchema.safeParse(response).success).toBe(true);
    expect(
      responseSchema.safeParse({ ...response, committed_version: undefined })
        .success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        ...response,
        committed_version: "9223372036854775808",
      }).success,
    ).toBe(false);
  });

  it("returns the committed int64 version from watchlist DELETE", () => {
    const responseSchema = m1Router.watchlistDeleteItem.responses[200];
    const response = {
      request_id: "request_1",
      trace_id: "trace_1",
      removed: true,
      committed_version: "9223372036854775807",
    } as const;

    expect(responseSchema.safeParse(response).success).toBe(true);
    expect(
      responseSchema.safeParse({ ...response, committed_version: undefined })
        .success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        ...response,
        committed_version: "9223372036854775808",
      }).success,
    ).toBe(false);
  });
});

describe("M1 feed SDK payload boundary", () => {
  const feedResponseSchema = m1Router.feedGet.responses[200];
  const envelope = {
    schema_version: 1,
    published_at: "2026-08-09T08:00:00Z",
    source: "huoqiu-synthetic",
    permissions: {
      alpha_access: true,
      visibility: "alpha-public",
    },
  } as const;
  const cards = [
    {
      ...envelope,
      type: "post",
      card_id: "card_post_1",
      payload: {
        author_id: "user_demo_1",
        author_name: "Demo User",
        title: "Post title",
        body: "Post body",
      },
    },
    {
      ...envelope,
      type: "news",
      card_id: "card_news_1",
      payload: {
        publisher: "Demo News",
        title: "News title",
        summary: "News summary",
      },
    },
    {
      ...envelope,
      type: "market_strip",
      card_id: "card_market_strip_1",
      payload: {
        title: "Market snapshot",
        listing_ids: ["listing_US_AAPL"],
        notice: "Synthetic data",
      },
    },
    {
      ...envelope,
      type: "topic",
      card_id: "card_topic_1",
      payload: {
        title: "Topic title",
        summary: "Topic summary",
      },
    },
    {
      ...envelope,
      type: "ops_banner",
      card_id: "card_ops_banner_1",
      payload: {
        title: "Maintenance notice",
        body: "Read-only maintenance starts at 09:00 UTC.",
      },
    },
  ] as const;
  const response = {
    request_id: "request_1",
    trace_id: "trace_1",
    items: cards,
    next_cursor: null,
  } as const;

  it("accepts the five strict discriminated card payloads", () => {
    expect(feedResponseSchema.safeParse(response).success).toBe(true);
  });

  it("rejects a payload that does not match its card discriminator", () => {
    const invalidPost = {
      ...cards[0],
      payload: cards[1].payload,
    };

    expect(
      feedResponseSchema.safeParse({ ...response, items: [invalidPost] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown payload fields at the SDK boundary", () => {
    const leakingPost = {
      ...cards[0],
      payload: { ...cards[0].payload, internal_rank: 0.99 },
    };

    expect(
      feedResponseSchema.safeParse({ ...response, items: [leakingPost] })
        .success,
    ).toBe(false);
  });
});

describe("M1 safe identifiers and notification deep links", () => {
  it.each([
    "listing_US_AAPL",
    "550e8400-e29b-41d4-a716-446655440000",
    "post:01J00000000000000000000000",
    "instrument.hk_00700",
  ])("accepts opaque ID %s", (id) => {
    expect(resourceIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    "../admin",
    "listing/../../admin",
    "listing\\admin",
    "/admin",
    "listing\nadmin",
    "listing\0admin",
    "listing id",
    "..",
    "listing%2Fadmin",
  ])("rejects unsafe opaque ID %j", (id) => {
    expect(resourceIdSchema.safeParse(id).success).toBe(false);
  });

  it.each([
    "/posts/post_01J00000000000000000000000",
    "/notifications?cursor=42",
    "https://huoqiu.example/posts/post_01J00000000000000000000000",
  ])("accepts safe deep link %s", (deepLink) => {
    expect(
      notificationSchema.safeParse({
        ...validNotification,
        deep_link: deepLink,
      }).success,
    ).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://huoqiu.example/posts/post_1",
    "//evil.example/steal",
    "/%2fevil.example/steal",
    "/%252fevil.example/steal",
    "../admin",
    "/../admin",
    "/%2e%2e/admin",
    "/%252e%252e/admin",
    "https://huoqiu.example/%2e%2e/admin",
    "https://huoqiu.example/%252e%252e/admin",
    "https://user:password@huoqiu.example/posts/post_1",
    "\\\\evil.example\\steal",
    "https://huoqiu.example\\@evil.example/steal",
    "/posts/post_1\njavascript:alert(1)",
  ])("rejects unsafe deep link %j", (deepLink) => {
    expect(
      notificationSchema.safeParse({
        ...validNotification,
        deep_link: deepLink,
      }).success,
    ).toBe(false);
  });
});
