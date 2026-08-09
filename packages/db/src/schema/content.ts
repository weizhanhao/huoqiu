import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import {
  aggregateVersion,
  bigintCounter,
  createdAt,
  textId,
  updatedAt,
} from "./_shared.js";

export const contentPosts = pgTable(
  "content_posts",
  {
    id: textId(),
    authorId: text("author_id").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    status: text("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }),
    deletedAt: timestamp("deleted_at", {
      mode: "date",
      withTimezone: true,
    }),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("content_posts_author_client_request_unique").on(
      table.authorId,
      table.clientRequestId,
    ),
  ],
);

export const contentPostRevisions = pgTable(
  "content_post_revisions",
  {
    id: textId(),
    postId: text("post_id")
      .notNull()
      .references(() => contentPosts.id, { onDelete: "cascade" }),
    revision: bigintCounter("revision"),
    editorId: text("editor_id").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("content_post_revisions_post_revision_unique").on(
      table.postId,
      table.revision,
    ),
  ],
);
