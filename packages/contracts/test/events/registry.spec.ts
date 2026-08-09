import { describe, expect, it } from "vitest";

import {
  approvedEventTypes,
  eventEnvelopeSchema,
  eventRegistry,
} from "../../src/events/index.js";

const producers = [
  "identity",
  "content",
  "social",
  "moderation",
  "watchlist",
  "notification",
  "portfolio",
  "market",
] as const;

const requiredPayloadKeys: Readonly<Record<string, readonly string[]>> = {
  "identity.user_registered": ["user_id", "reason", "effective_at"],
  "content.post_submitted": ["post_id", "author_id", "status", "version"],
  "moderation.decision_recorded": [
    "case_id",
    "target_type",
    "target_id",
    "action",
    "decision_version",
  ],
  "content.post_published": ["post_id", "author_id", "status", "version"],
  "content.post_hidden": ["post_id", "author_id", "status", "version"],
  "content.post_restored": ["post_id", "author_id", "status", "version"],
  "identity.user_suspended": ["user_id", "reason", "effective_at"],
  "social.comment_submitted": ["comment_id", "author_id", "status", "version"],
  "social.comment_published": ["comment_id", "author_id", "status", "version"],
  "social.comment_hidden": ["comment_id", "author_id", "status", "version"],
  "social.comment_restored": ["comment_id", "author_id", "status", "version"],
  "social.reaction_changed": ["actor_id", "target_type", "target_id", "active"],
  "watchlist.item_changed": ["user_id", "listing_id", "present"],
  "notification.created": [
    "notification_id",
    "recipient_id",
    "canonical_key",
    "deep_link",
  ],
  "notification.read_watermark_advanced": ["recipient_id", "read_watermark"],
  "moderation.report_submitted": [
    "report_id",
    "case_id",
    "reporter_id",
    "target_type",
    "target_id",
    "reason_code",
  ],
  "portfolio.ledger_entry_posted": [
    "portfolio_id",
    "ledger_entry_id",
    "committed_version",
  ],
  "market.quote_revised": ["listing_id", "sequence", "revision", "as_of"],
};

const forbiddenPayloadKeys = [
  "email",
  "token",
  "body",
  "text",
  "content",
  "evidence",
  "rationale",
  "trade",
  "private_fund",
  "payment",
  "push",
  "ai_advice",
] as const;

const forbiddenPayloadKey = new RegExp(
  `(?:${forbiddenPayloadKeys.join("|")})`,
  "iu",
);

const collectKeys = (
  value: unknown,
  output: string[] = [],
): readonly string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, output));
    return output;
  }
  if (typeof value !== "object" || value === null) {
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    output.push(key);
    collectKeys(child, output);
  }
  return output;
};

const clone = <T>(value: T): T => structuredClone(value);

const requireRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an event payload object");
  }
  return value as Record<string, unknown>;
};

describe("M1 event registry", () => {
  it("contains exactly the 18 approved event types in their approved order", () => {
    expect(eventRegistry).toHaveLength(18);
    expect(new Set(eventRegistry.map((event) => event.type)).size).toBe(18);
    expect(eventRegistry.map((event) => event.type)).toEqual(
      approvedEventTypes,
    );
  });

  it("binds every event type to one approved producer and version", () => {
    for (const event of eventRegistry) {
      expect(producers).toContain(event.producer);
      expect(event.version).toBe(1);
      expect(event.sample.event_type).toBe(event.type);
      expect(event.sample.producer).toBe(event.producer);
    }
  });

  it("validates the unified strict envelope with string int64 sequence semantics", () => {
    const sample = eventRegistry[0]?.sample;
    expect(sample).toBeDefined();
    expect(eventEnvelopeSchema.parse(sample).version).toBe(1);

    expect(
      eventEnvelopeSchema.safeParse({ ...sample, sequence: "0" }).success,
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({
        ...sample,
        sequence: "9223372036854775806",
      }).success,
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({
        ...sample,
        sequence: "9223372036854775807",
      }).success,
    ).toBe(true);
    for (const sequence of [
      1,
      -1,
      "-1",
      "01",
      "1\n",
      "9223372036854775808",
      "9".repeat(128),
    ]) {
      expect(
        eventEnvelopeSchema.safeParse({ ...sample, sequence }).success,
        String(sequence),
      ).toBe(false);
    }
    expect(
      eventEnvelopeSchema.safeParse({ ...sample, unexpected: true }).success,
    ).toBe(false);
  });

  it("validates every deterministic sample through its event-specific schema", () => {
    for (const event of eventRegistry) {
      expect(event.schema.safeParse(event.sample).success, event.type).toBe(
        true,
      );

      const wrongType = clone(event.sample);
      wrongType.event_type = "identity.user_registered";
      if (event.type !== "identity.user_registered") {
        expect(event.schema.safeParse(wrongType).success, event.type).toBe(
          false,
        );
      }

      const wrongProducer = clone(event.sample);
      wrongProducer.producer =
        event.producer === "identity" ? "content" : "identity";
      expect(event.schema.safeParse(wrongProducer).success, event.type).toBe(
        false,
      );
    }
  });

  it("keeps every payload minimal, strict, and free of prohibited data", () => {
    for (const event of eventRegistry) {
      expect(
        Object.keys(requireRecord(event.sample.payload)).sort(),
        event.type,
      ).toEqual([...(requiredPayloadKeys[event.type] ?? [])].sort());
      expect(
        collectKeys(event.sample.payload).filter((key) =>
          forbiddenPayloadKey.test(key),
        ),
        event.type,
      ).toEqual([]);

      for (const forbiddenKey of forbiddenPayloadKeys) {
        const withForbiddenKey = clone(event.sample);
        (withForbiddenKey.payload as Record<string, unknown>)[forbiddenKey] =
          "must-not-cross-the-event-boundary";
        expect(
          event.schema.safeParse(withForbiddenKey).success,
          `${event.type}:${forbiddenKey}`,
        ).toBe(false);
      }
    }
  });

  it("reuses the approved deep-link policy for notification events", () => {
    const notification = eventRegistry.find(
      (event) => event.type === "notification.created",
    );
    expect(notification).toBeDefined();
    if (notification === undefined) return;

    for (const deepLink of [
      "/posts/post_01J00000000000000000000000",
      "huoqiu://instrument/listing_demo_0001",
      null,
    ]) {
      const sample = clone(notification.sample);
      (sample.payload as Record<string, unknown>).deep_link = deepLink;
      expect(
        notification.schema.safeParse(sample).success,
        String(deepLink),
      ).toBe(true);
    }

    for (const deepLink of [
      "https://example.com/posts/1",
      "//example.com/posts/1",
      "huoqiu://trade/order_1",
      "/admin/moderation",
      "/posts/%252Fadmin",
      "/login\n",
    ]) {
      const sample = clone(notification.sample);
      (sample.payload as Record<string, unknown>).deep_link = deepLink;
      expect(notification.schema.safeParse(sample).success, deepLink).toBe(
        false,
      );
    }
  });
});
