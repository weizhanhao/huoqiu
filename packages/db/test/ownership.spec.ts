import { readFile } from "node:fs/promises";

import { getTableName } from "drizzle-orm";
import {
  getTableConfig,
  pgTable,
  text,
  timestamp,
  type AnyPgTable,
} from "drizzle-orm/pg-core";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";

import { authProviderPrivateSchema } from "../src/schema/auth-provider-private.js";
import { publicSchema } from "../src/schema/index.js";

interface OwnershipEntry {
  readonly authority:
    | "aggregate"
    | "append-only"
    | "audit-only"
    | "projection-only"
    | "provider-private";
  readonly mutable: boolean;
  readonly owner: string;
}

interface OwnershipManifest {
  readonly policies: {
    readonly crossOwnerForeignKeys: "forbidden";
    readonly crossOwnerWrites: "forbidden";
  };
  readonly tables: Readonly<Record<string, OwnershipEntry>>;
  readonly version: 1;
}

const readOwnershipManifest = async (): Promise<OwnershipManifest> => {
  const manifestUrl = new URL(
    "../../domain/table-ownership.yaml",
    import.meta.url,
  );
  const source = await readFile(manifestUrl, "utf8");
  const document = parseDocument(source, { uniqueKeys: true });

  expect(document.errors).toEqual([]);
  return document.toJS() as OwnershipManifest;
};

const allTables = {
  ...publicSchema,
  ...authProviderPrivateSchema,
};

const collectForeignKeyOwnershipViolations = (
  tables: readonly AnyPgTable[],
  owners: Readonly<Record<string, string>>,
): string[] =>
  tables.flatMap((table) => {
    const sourceName = getTableName(table);
    const sourceOwner = owners[sourceName];
    return getTableConfig(table).foreignKeys.flatMap((foreignKey) => {
      const targetName = getTableName(foreignKey.reference().foreignTable);
      const targetOwner = owners[targetName];
      return sourceOwner !== undefined && sourceOwner === targetOwner
        ? []
        : [`${sourceName}->${targetName}`];
    });
  });

describe("M1 physical table ownership", () => {
  it("assigns every approved physical table to exactly one owner", async () => {
    const manifest = await readOwnershipManifest();
    const physicalTableNames = Object.values(allTables)
      .map((table) => getTableName(table))
      .sort();
    const ownedTableNames = Object.keys(manifest.tables).sort();

    expect(manifest.version).toBe(1);
    expect(ownedTableNames).toEqual(physicalTableNames);
    expect(
      Object.values(manifest.tables).every(
        (entry) =>
          typeof entry.owner === "string" &&
          entry.owner.length > 0 &&
          !entry.owner.includes(","),
      ),
    ).toBe(true);
  });

  it("forbids cross-owner foreign keys and cross-owner writes", async () => {
    const manifest = await readOwnershipManifest();
    const owners = Object.fromEntries(
      Object.entries(manifest.tables).map(([table, entry]) => [
        table,
        entry.owner,
      ]),
    );

    expect(manifest.policies).toMatchObject({
      crossOwnerForeignKeys: "forbidden",
      crossOwnerWrites: "forbidden",
    });
    expect(
      collectForeignKeyOwnershipViolations(Object.values(allTables), owners),
    ).toEqual([]);
  });

  it("requires every mutable aggregate and projection to use bigint version", async () => {
    const manifest = await readOwnershipManifest();
    const tablesByName = new Map<string, AnyPgTable>(
      Object.values(allTables).map((table) => [getTableName(table), table]),
    );

    const violations = Object.entries(manifest.tables).flatMap(
      ([tableName, entry]) => {
        if (!entry.mutable) {
          return [];
        }
        const table = tablesByName.get(tableName);
        const version =
          table === undefined
            ? undefined
            : getTableConfig(table).columns.find(
                (column) => column.name === "version",
              );
        return version?.getSQLType() === "bigint"
          ? []
          : [`${tableName}.version`];
      },
    );

    expect(violations).toEqual([]);
  });

  it("marks Search and Operations as projection/audit consumers only", async () => {
    const manifest = await readOwnershipManifest();

    expect(manifest.tables.search_documents).toMatchObject({
      authority: "projection-only",
      owner: "search",
    });
    expect(manifest.tables.operations_admin_audit).toMatchObject({
      authority: "audit-only",
      owner: "operations",
    });
  });

  it("proves the foreign-key metadata check rejects a cross-owner mutant", () => {
    const ownerTable = pgTable("mutant_identity_owner", {
      id: text("id").primaryKey(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    });
    const foreignWriter = pgTable("mutant_content_writer", {
      id: text("id").primaryKey(),
      identityUserId: text("identity_user_id")
        .notNull()
        .references(() => ownerTable.id),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    });

    expect(
      collectForeignKeyOwnershipViolations([ownerTable, foreignWriter], {
        mutant_content_writer: "content",
        mutant_identity_owner: "identity",
      }),
    ).toEqual(["mutant_content_writer->mutant_identity_owner"]);
  });
});
