import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const watchlists = pgTable(
  "watchlists",
  {
    id: textId(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").default("default").notNull(),
    name: text("name").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("watchlists_owner_kind_unique").on(table.ownerId, table.kind),
  ],
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: textId(),
    watchlistId: text("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("watchlist_items_list_listing_unique").on(
      table.watchlistId,
      table.listingId,
    ),
  ],
);
