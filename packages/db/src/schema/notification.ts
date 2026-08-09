import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  aggregateVersion,
  bigintCounter,
  createdAt,
  textId,
  updatedAt,
} from "./_shared.js";

export const notifications = pgTable(
  "notifications",
  {
    id: textId(),
    recipientId: text("recipient_id").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    status: text("status").default("unread").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notifications_recipient_canonical_key_unique").on(
      table.recipientId,
      table.canonicalKey,
    ),
  ],
);

export const notificationReadState = pgTable(
  "notification_read_state",
  {
    id: textId(),
    recipientId: text("recipient_id").notNull(),
    watermarkAt: timestamp("watermark_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notification_read_state_recipient_unique").on(
      table.recipientId,
    ),
  ],
);

export const notificationDeliveryAttempts = pgTable(
  "notification_delivery_attempts",
  {
    id: textId(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    attempt: bigintCounter("attempt"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    attemptedAt: timestamp("attempted_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_delivery_attempt_unique").on(
      table.notificationId,
      table.channel,
      table.attempt,
    ),
  ],
);
