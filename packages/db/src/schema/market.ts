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
  decimal,
  optionalDecimal,
  textId,
  updatedAt,
} from "./_shared.js";

export const marketObservations = pgTable(
  "market_observations",
  {
    id: textId(),
    provider: text("provider").notNull(),
    listingId: text("listing_id").notNull(),
    sequence: bigintCounter("sequence"),
    revision: bigintCounter("revision"),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    observedValue: decimal("observed_value"),
    sourceEventId: uuid("source_event_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex(
      "market_observations_provider_listing_sequence_revision_unique",
    ).on(table.provider, table.listingId, table.sequence, table.revision),
  ],
);

export const marketQuotes = pgTable(
  "market_quotes",
  {
    id: textId(),
    observationId: text("observation_id")
      .notNull()
      .references(() => marketObservations.id),
    provider: text("provider").notNull(),
    listingId: text("listing_id").notNull(),
    sequence: bigintCounter("sequence"),
    revision: bigintCounter("revision"),
    quotedAt: timestamp("quoted_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    bidPrice: optionalDecimal("bid_price"),
    bidQuantity: optionalDecimal("bid_quantity"),
    askPrice: optionalDecimal("ask_price"),
    askQuantity: optionalDecimal("ask_quantity"),
    lastPrice: decimal("last_price"),
    lastQuantity: optionalDecimal("last_quantity"),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("market_quotes_provider_listing_sequence_revision_unique").on(
      table.provider,
      table.listingId,
      table.sequence,
      table.revision,
    ),
  ],
);

export const marketBars = pgTable(
  "market_bars",
  {
    id: textId(),
    provider: text("provider").notNull(),
    listingId: text("listing_id").notNull(),
    interval: text("interval").notNull(),
    startsAt: timestamp("starts_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    endsAt: timestamp("ends_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    openPrice: decimal("open_price"),
    highPrice: decimal("high_price"),
    lowPrice: decimal("low_price"),
    closePrice: decimal("close_price"),
    volume: decimal("volume"),
    revision: bigintCounter("revision"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("market_bars_listing_interval_start_revision_unique").on(
      table.provider,
      table.listingId,
      table.interval,
      table.startsAt,
      table.revision,
    ),
  ],
);

export const marketEntitlementProjection = pgTable(
  "market_entitlement_projection",
  {
    id: textId(),
    subjectId: text("subject_id").notNull(),
    market: text("market").notNull(),
    entitlement: text("entitlement").notNull(),
    validUntil: timestamp("valid_until", {
      mode: "date",
      withTimezone: true,
    }),
    sourceEventId: uuid("source_event_id"),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("market_entitlement_subject_market_unique").on(
      table.subjectId,
      table.market,
    ),
  ],
);
