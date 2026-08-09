import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  aggregateVersion,
  createdAt,
  decimal,
  optionalDecimal,
  textId,
  updatedAt,
} from "./_shared.js";

export const portfolios = pgTable("portfolios", {
  id: textId(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull(),
  status: text("status").default("active").notNull(),
  version: aggregateVersion(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const portfolioLedgerEntries = pgTable(
  "portfolio_ledger_entries",
  {
    id: textId(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    clientRequestId: text("client_request_id").notNull(),
    entryType: text("entry_type").notNull(),
    listingId: text("listing_id"),
    quantity: optionalDecimal("quantity"),
    price: optionalDecimal("price"),
    amount: decimal("amount"),
    fees: decimal("fees").default("0"),
    currency: text("currency").notNull(),
    reversalOfId: text("reversal_of_id").references(
      (): AnyPgColumn => portfolioLedgerEntries.id,
    ),
    postedAt: timestamp("posted_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("portfolio_ledger_portfolio_client_request_unique").on(
      table.portfolioId,
      table.clientRequestId,
    ),
  ],
);

export const portfolioPositionProjection = pgTable(
  "portfolio_position_projection",
  {
    id: textId(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull(),
    quantity: decimal("quantity"),
    averageCost: decimal("average_cost"),
    marketValue: decimal("market_value"),
    asOf: timestamp("as_of", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("portfolio_position_portfolio_listing_unique").on(
      table.portfolioId,
      table.listingId,
    ),
  ],
);

export const portfolioValuationSnapshots = pgTable(
  "portfolio_valuation_snapshots",
  {
    id: textId(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    totalValue: decimal("total_value"),
    cashValue: decimal("cash_value"),
    currency: text("currency").notNull(),
    asOf: timestamp("as_of", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("portfolio_valuation_portfolio_as_of_unique").on(
      table.portfolioId,
      table.asOf,
    ),
  ],
);
