import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  aggregateVersion,
  createdAt,
  decimal,
  textId,
  updatedAt,
} from "./_shared.js";

export const feedChannels = pgTable(
  "feed_channels",
  {
    id: textId(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("feed_channels_key_unique").on(table.key)],
);

export const feedItems = pgTable(
  "feed_items",
  {
    id: textId(),
    channelId: text("channel_id")
      .notNull()
      .references(() => feedChannels.id, { onDelete: "cascade" }),
    sourceEventId: uuid("source_event_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    cardType: text("card_type").notNull(),
    cardPayload: jsonb("card_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    rankingValue: decimal("ranking_value"),
    visible: boolean("visible").default(true).notNull(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("feed_items_channel_source_event_unique").on(
      table.channelId,
      table.sourceEventId,
    ),
  ],
);

export const feedRankingSnapshots = pgTable(
  "feed_ranking_snapshots",
  {
    id: textId(),
    channelId: text("channel_id")
      .notNull()
      .references(() => feedChannels.id, { onDelete: "cascade" }),
    sourceEventId: uuid("source_event_id").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    rankedItems: jsonb("ranked_items")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
    computedAt: timestamp("computed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("feed_ranking_channel_source_event_unique").on(
      table.channelId,
      table.sourceEventId,
    ),
  ],
);
