import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bigintCounter, createdAt, textId } from "./_shared.js";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    aggregateVersion: bigintCounter("aggregate_version"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }),
    attempts: bigintCounter("attempts").default(sql`0`),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("outbox_events_event_id_unique").on(table.eventId)],
);

export const inboxReceipts = pgTable(
  "inbox_receipts",
  {
    id: textId(),
    consumer: text("consumer").notNull(),
    eventId: uuid("event_id").notNull(),
    receivedAt: timestamp("received_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    processedAt: timestamp("processed_at", {
      mode: "date",
      withTimezone: true,
    }),
    outcome: text("outcome"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("inbox_receipts_consumer_event_unique").on(
      table.consumer,
      table.eventId,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: textId(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: text("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idempotency_records_scope_key_unique").on(
      table.scope,
      table.key,
    ),
  ],
);
