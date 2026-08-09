import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: textId(),
    documentType: text("document_type").notNull(),
    documentId: text("document_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<readonly string[]>().default([]).notNull(),
    visibility: text("visibility").default("public").notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("search_documents_type_document_unique").on(
      table.documentType,
      table.documentId,
    ),
  ],
);
