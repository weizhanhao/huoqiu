import { date, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const exchanges = pgTable(
  "exchanges",
  {
    id: textId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    market: text("market").notNull(),
    timezone: text("timezone").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("exchanges_code_unique").on(table.code)],
);

export const instruments = pgTable("instruments", {
  id: textId(),
  name: text("name").notNull(),
  instrumentType: text("instrument_type").notNull(),
  currency: text("currency").notNull(),
  status: text("status").default("active").notNull(),
  version: aggregateVersion(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const listings = pgTable(
  "listings",
  {
    id: textId(),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id),
    exchangeId: text("exchange_id")
      .notNull()
      .references(() => exchanges.id),
    market: text("market").notNull(),
    symbol: text("symbol").notNull(),
    currency: text("currency").notNull(),
    status: text("status").default("active").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("listings_market_symbol_unique").on(table.market, table.symbol),
  ],
);

export const exchangeCalendars = pgTable(
  "exchange_calendars",
  {
    id: textId(),
    exchangeId: text("exchange_id")
      .notNull()
      .references(() => exchanges.id, { onDelete: "cascade" }),
    tradingDate: date("trading_date", { mode: "date" }).notNull(),
    sessionState: text("session_state").notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exchange_calendars_exchange_date_unique").on(
      table.exchangeId,
      table.tradingDate,
    ),
  ],
);
