import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const moderationReports = pgTable(
  "moderation_reports",
  {
    id: textId(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reporterId: text("reporter_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    detail: text("detail"),
    status: text("status").default("open").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("moderation_reports_target_reporter_reason_unique").on(
      table.targetType,
      table.targetId,
      table.reporterId,
      table.reasonCode,
    ),
  ],
);

export const moderationCases = pgTable("moderation_cases", {
  id: textId(),
  primaryReportId: text("primary_report_id")
    .notNull()
    .references(() => moderationReports.id),
  status: text("status").default("open").notNull(),
  severity: text("severity").default("normal").notNull(),
  assignedReviewerId: text("assigned_reviewer_id"),
  version: aggregateVersion(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const moderationEvidence = pgTable("moderation_evidence", {
  id: textId(),
  caseId: text("case_id")
    .notNull()
    .references(() => moderationCases.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type").notNull(),
  storageReference: text("storage_reference").notNull(),
  digest: text("digest").notNull(),
  submittedById: text("submitted_by_id").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const moderationDecisions = pgTable("moderation_decisions", {
  id: textId(),
  caseId: text("case_id")
    .notNull()
    .references(() => moderationCases.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  sourceEventId: uuid("source_event_id"),
  createdAt: createdAt(),
});

export const moderationAppeals = pgTable("moderation_appeals", {
  id: textId(),
  caseId: text("case_id")
    .notNull()
    .references(() => moderationCases.id, { onDelete: "cascade" }),
  decisionId: text("decision_id")
    .notNull()
    .references(() => moderationDecisions.id),
  appellantId: text("appellant_id").notNull(),
  body: text("body").notNull(),
  status: text("status").default("submitted").notNull(),
  version: aggregateVersion(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const moderationAudit = pgTable("moderation_audit", {
  id: textId(),
  caseId: text("case_id")
    .notNull()
    .references(() => moderationCases.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});
