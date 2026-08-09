import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, textId } from "./_shared.js";

export const operationsAdminAudit = pgTable(
  "operations_admin_audit",
  {
    id: textId(),
    eventId: uuid("event_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("operations_admin_audit_event_unique").on(table.eventId),
  ],
);
