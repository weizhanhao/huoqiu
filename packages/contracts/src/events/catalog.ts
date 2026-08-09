import { z } from "zod4";

import {
  eventEnvelopeSchema,
  type EventEnvelope,
  type EventProducer,
} from "./envelope.js";
import { eventPayloadSchemas } from "./payloads.js";
import type { ApprovedEventType } from "./registry.js";

interface EventCatalogEntry {
  readonly type: ApprovedEventType;
  readonly producer: EventProducer;
  readonly version: 1;
  readonly schema: z.ZodType;
  readonly sample: EventEnvelope;
}

const createEventSchema = <
  Type extends ApprovedEventType,
  Producer extends EventProducer,
  Payload extends z.ZodType,
>(
  type: Type,
  producer: Producer,
  payload: Payload,
) =>
  eventEnvelopeSchema.extend({
    event_type: z.literal(type),
    producer: z.literal(producer),
    payload,
  });

const createSample = (
  ordinal: number,
  eventType: ApprovedEventType,
  producer: EventProducer,
  aggregateId: string,
  payload: Record<string, unknown>,
): EventEnvelope => ({
  event_id: `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`,
  event_type: eventType,
  version: 1,
  occurred_at: "2026-08-08T00:00:00.000Z",
  producer,
  aggregate_id: aggregateId,
  sequence: String(ordinal),
  trace_id: `trace_event_${ordinal.toString().padStart(2, "0")}`,
  payload,
});

const definitions = [
  {
    type: "identity.user_registered",
    producer: "identity",
    aggregateId: "user_demo_0001",
    payload: {
      user_id: "user_demo_0001",
      reason: "registration",
      effective_at: "2026-08-08T00:00:00.000Z",
    },
  },
  {
    type: "content.post_submitted",
    producer: "content",
    aggregateId: "post_demo_0001",
    payload: {
      post_id: "post_demo_0001",
      author_id: "user_demo_0001",
      status: "submitted",
      version: "1",
    },
  },
  {
    type: "moderation.decision_recorded",
    producer: "moderation",
    aggregateId: "case_demo_0001",
    payload: {
      case_id: "case_demo_0001",
      target_type: "post",
      target_id: "post_demo_0001",
      action: "approve",
      decision_version: "1",
    },
  },
  {
    type: "content.post_published",
    producer: "content",
    aggregateId: "post_demo_0001",
    payload: {
      post_id: "post_demo_0001",
      author_id: "user_demo_0001",
      status: "published",
      version: "2",
    },
  },
  {
    type: "content.post_hidden",
    producer: "content",
    aggregateId: "post_demo_0001",
    payload: {
      post_id: "post_demo_0001",
      author_id: "user_demo_0001",
      status: "hidden",
      version: "3",
    },
  },
  {
    type: "content.post_restored",
    producer: "content",
    aggregateId: "post_demo_0001",
    payload: {
      post_id: "post_demo_0001",
      author_id: "user_demo_0001",
      status: "restored",
      version: "4",
    },
  },
  {
    type: "identity.user_suspended",
    producer: "identity",
    aggregateId: "user_demo_0002",
    payload: {
      user_id: "user_demo_0002",
      reason: "policy_violation",
      effective_at: "2026-08-08T00:06:00.000Z",
    },
  },
  {
    type: "social.comment_submitted",
    producer: "social",
    aggregateId: "comment_demo_0001",
    payload: {
      comment_id: "comment_demo_0001",
      author_id: "user_demo_0002",
      status: "submitted",
      version: "1",
    },
  },
  {
    type: "social.comment_published",
    producer: "social",
    aggregateId: "comment_demo_0001",
    payload: {
      comment_id: "comment_demo_0001",
      author_id: "user_demo_0002",
      status: "published",
      version: "2",
    },
  },
  {
    type: "social.comment_hidden",
    producer: "social",
    aggregateId: "comment_demo_0001",
    payload: {
      comment_id: "comment_demo_0001",
      author_id: "user_demo_0002",
      status: "hidden",
      version: "3",
    },
  },
  {
    type: "social.comment_restored",
    producer: "social",
    aggregateId: "comment_demo_0001",
    payload: {
      comment_id: "comment_demo_0001",
      author_id: "user_demo_0002",
      status: "restored",
      version: "4",
    },
  },
  {
    type: "social.reaction_changed",
    producer: "social",
    aggregateId: "post_demo_0001",
    payload: {
      actor_id: "user_demo_0002",
      target_type: "post",
      target_id: "post_demo_0001",
      active: true,
    },
  },
  {
    type: "watchlist.item_changed",
    producer: "watchlist",
    aggregateId: "user_demo_0001",
    payload: {
      user_id: "user_demo_0001",
      listing_id: "listing_demo_0001",
      present: true,
    },
  },
  {
    type: "notification.created",
    producer: "notification",
    aggregateId: "notification_demo_0001",
    payload: {
      notification_id: "notification_demo_0001",
      recipient_id: "user_demo_0001",
      canonical_key: "post.published",
      deep_link: "/posts/post_demo_0001",
    },
  },
  {
    type: "notification.read_watermark_advanced",
    producer: "notification",
    aggregateId: "user_demo_0001",
    payload: {
      recipient_id: "user_demo_0001",
      read_watermark: "14",
    },
  },
  {
    type: "moderation.report_submitted",
    producer: "moderation",
    aggregateId: "case_demo_0002",
    payload: {
      report_id: "report_demo_0001",
      case_id: "case_demo_0002",
      reporter_id: "user_demo_0001",
      target_type: "comment",
      target_id: "comment_demo_0001",
      reason_code: "spam",
    },
  },
  {
    type: "portfolio.ledger_entry_posted",
    producer: "portfolio",
    aggregateId: "portfolio_demo_0001",
    payload: {
      portfolio_id: "portfolio_demo_0001",
      ledger_entry_id: "ledger_entry_demo_0001",
      committed_version: "1",
    },
  },
  {
    type: "market.quote_revised",
    producer: "market",
    aggregateId: "listing_demo_0001",
    payload: {
      listing_id: "listing_demo_0001",
      sequence: "18",
      revision: "1",
      as_of: "2026-08-08T00:18:00.000Z",
    },
  },
] as const satisfies readonly {
  readonly type: ApprovedEventType;
  readonly producer: EventProducer;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}[];

export const eventRegistry: readonly EventCatalogEntry[] = definitions.map(
  (definition, index) => ({
    type: definition.type,
    producer: definition.producer,
    version: 1,
    schema: createEventSchema(
      definition.type,
      definition.producer,
      eventPayloadSchemas[definition.type],
    ),
    sample: createSample(
      index + 1,
      definition.type,
      definition.producer,
      definition.aggregateId,
      definition.payload,
    ),
  }),
);
