import { getTableName } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  getTableConfig,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  type AnyPgTable,
  uuid,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { authProviderPrivateSchema } from "../src/schema/auth-provider-private.js";
import { publicSchema } from "../src/schema/index.js";

const allPublicTables = Object.values(publicSchema);
const allPhysicalTables = [
  ...allPublicTables,
  ...Object.values(authProviderPrivateSchema),
];

const numericSemanticColumn =
  /(?:^|_)(?:amount|average_cost|cash_value|fees|market_value|observed_value|price|quantity|total_value|value|volume)$/u;

const collectPhysicalViolations = (tables: readonly AnyPgTable[]): string[] => {
  const violations: string[] = [];

  for (const table of tables) {
    const tableName = getTableName(table);
    const config = getTableConfig(table);
    const createdAt = config.columns.find(
      (column) => column.name === "created_at",
    );

    if (createdAt === undefined) {
      violations.push(`${tableName}.created_at:missing`);
    }

    for (const column of config.columns) {
      const sqlType = column.getSQLType().toLowerCase();
      if (sqlType.includes("double precision") || sqlType === "real") {
        violations.push(`${tableName}.${column.name}:floating-point`);
      }
      if (
        numericSemanticColumn.test(column.name) &&
        sqlType !== "numeric(38, 18)"
      ) {
        violations.push(`${tableName}.${column.name}:expected-numeric-38-18`);
      }
      if (
        sqlType.startsWith("timestamp") &&
        !sqlType.includes("with time zone")
      ) {
        violations.push(
          `${tableName}.${column.name}:timestamp-without-time-zone`,
        );
      }
    }
  }

  return violations;
};

const collectIdTypeViolations = (tables: readonly AnyPgTable[]): string[] =>
  tables.flatMap((table) => {
    const tableName = getTableName(table);
    return getTableConfig(table).columns.flatMap((column) => {
      const isId = column.name === "id" || column.name.endsWith("_id");
      if (!isId) {
        return [];
      }
      const expectedType = ["event_id", "source_event_id"].includes(column.name)
        ? "uuid"
        : "text";
      const actualType = column.getSQLType();
      return actualType === expectedType
        ? []
        : [`${tableName}.${column.name}:${actualType}->${expectedType}`];
    });
  });

const requiredUniqueIndexes = [
  "identity_users_normalized_email_unique",
  "identity_users_subject_unique",
  "listings_market_symbol_unique",
  "market_observations_provider_listing_sequence_revision_unique",
  "content_posts_author_client_request_unique",
  "social_reactions_actor_target_type_unique",
  "moderation_reports_target_reporter_reason_unique",
  "feed_items_channel_source_event_unique",
  "watchlists_owner_kind_unique",
  "watchlist_items_list_listing_unique",
  "notifications_recipient_canonical_key_unique",
  "portfolio_ledger_portfolio_client_request_unique",
  "inbox_receipts_consumer_event_unique",
  "idempotency_records_scope_key_unique",
] as const;

describe("M1 PostgreSQL schema physical constraints", () => {
  it("uses text business ids, numeric(38,18), bigint counters, and timestamptz", () => {
    expect(collectPhysicalViolations(allPublicTables)).toEqual([]);
    expect(collectIdTypeViolations(allPhysicalTables)).toEqual([]);
  });

  it("contains the approved idempotency, inbox/outbox, and domain unique indexes", () => {
    const uniqueIndexNames = allPublicTables.flatMap((table) =>
      getTableConfig(table)
        .indexes.filter((index) => index.config.unique)
        .map((index) => index.config.name),
    );

    expect(uniqueIndexNames).toEqual(
      expect.arrayContaining([...requiredUniqueIndexes]),
    );
  });

  it("proves the metadata checks reject representative physical mutants", () => {
    const missingCreatedAt = pgTable("mutant_missing_created_at", {
      id: text("id").primaryKey(),
    });
    const floatingAmount = pgTable("mutant_floating_amount", {
      id: text("id").primaryKey(),
      amount: doublePrecision("amount").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    });
    const naiveTimestamp = pgTable("mutant_naive_timestamp", {
      id: text("id").primaryKey(),
      createdAt: timestamp("created_at").notNull(),
    });

    expect(
      collectPhysicalViolations([
        missingCreatedAt,
        floatingAmount,
        naiveTimestamp,
      ]),
    ).toEqual(
      expect.arrayContaining([
        "mutant_missing_created_at.created_at:missing",
        "mutant_floating_amount.amount:floating-point",
        "mutant_floating_amount.amount:expected-numeric-38-18",
        "mutant_naive_timestamp.created_at:timestamp-without-time-zone",
      ]),
    );
  });

  it("distinguishes the required exact numeric and bigint metadata", () => {
    const numericTable = pgTable("mutant_numeric_width", {
      id: text("id").primaryKey(),
      price: numeric("price", { precision: 20, scale: 4 }).notNull(),
      version: integer("version").notNull(),
      sequence: bigint("sequence", { mode: "bigint" }).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    });
    const columns = Object.fromEntries(
      getTableConfig(numericTable).columns.map((column) => [
        column.name,
        column.getSQLType(),
      ]),
    );

    expect(columns).toMatchObject({
      price: "numeric(20, 4)",
      sequence: "bigint",
      version: "integer",
    });
    expect(collectPhysicalViolations([numericTable])).toContain(
      "mutant_numeric_width.price:expected-numeric-38-18",
    );
  });

  it("proves business ids and event ids cannot exchange physical types", () => {
    const mutantIds = pgTable("mutant_id_types", {
      id: uuid("id").primaryKey(),
      listingId: uuid("listing_id").notNull(),
      sourceEventId: text("source_event_id").notNull(),
      createdAt: timestamp("created_at", {
        withTimezone: true,
      }).notNull(),
    });

    expect(collectIdTypeViolations([mutantIds])).toEqual([
      "mutant_id_types.id:uuid->text",
      "mutant_id_types.listing_id:uuid->text",
      "mutant_id_types.source_event_id:text->uuid",
    ]);
  });
});
