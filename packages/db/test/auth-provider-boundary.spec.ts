import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  authProviderPrivateSchema,
  betterAuthDatabaseMapping,
} from "../src/schema/auth-provider-private.js";
import { identityUsers } from "../src/schema/identity.js";
import { publicSchema } from "../src/schema/index.js";

const expectedPrivateColumns = {
  auth_accounts: [
    "access_token",
    "access_token_expires_at",
    "account_id",
    "created_at",
    "id",
    "id_token",
    "password",
    "provider_id",
    "refresh_token",
    "refresh_token_expires_at",
    "scope",
    "updated_at",
    "user_id",
  ],
  auth_sessions: [
    "created_at",
    "expires_at",
    "id",
    "ip_address",
    "token",
    "updated_at",
    "user_agent",
    "user_id",
  ],
  auth_users: [
    "created_at",
    "email",
    "email_verified",
    "id",
    "image",
    "name",
    "updated_at",
  ],
  auth_verifications: [
    "created_at",
    "expires_at",
    "id",
    "identifier",
    "updated_at",
    "value",
  ],
} as const;

const walkTypeScript = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return walkTypeScript(path);
      }
      return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
};

describe("Accepted Better Auth provider-private schema", () => {
  it("matches the audited Better Auth 1.6.26 core tables and snake-case mapping", () => {
    const actual = Object.fromEntries(
      Object.values(authProviderPrivateSchema).map((table) => [
        getTableName(table),
        getTableConfig(table)
          .columns.map((column) => column.name)
          .sort(),
      ]),
    );

    expect(actual).toEqual(expectedPrivateColumns);
    expect(betterAuthDatabaseMapping).toMatchObject({
      account: { modelName: "auth_accounts" },
      session: { modelName: "auth_sessions" },
      user: { modelName: "auth_users" },
      verification: { modelName: "auth_verifications" },
    });
  });

  it("keeps provider tables out of the public schema entrypoint", () => {
    const publicPhysicalNames = Object.values(publicSchema).map((table) =>
      getTableName(table),
    );

    expect(publicPhysicalNames.some((name) => name.startsWith("auth_"))).toBe(
      false,
    );
    expect(Object.keys(publicSchema)).not.toEqual(
      expect.arrayContaining([
        "authAccounts",
        "authSessions",
        "authUsers",
        "authVerifications",
      ]),
    );
  });

  it("enforces Better Auth private uniqueness and same-owner references", () => {
    const privateTables = Object.values(authProviderPrivateSchema);
    const indexes = privateTables.flatMap((table) =>
      getTableConfig(table).indexes.map((index) => index.config),
    );
    const foreignReferences = privateTables.flatMap((table) =>
      getTableConfig(table).foreignKeys.map((foreignKey) => ({
        source: getTableName(table),
        target: getTableName(foreignKey.reference().foreignTable),
      })),
    );

    expect(
      indexes.filter((index) => index.unique).map((index) => index.name),
    ).toEqual(
      expect.arrayContaining([
        "auth_accounts_provider_account_unique",
        "auth_sessions_token_unique",
        "auth_users_email_unique",
      ]),
    );
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "auth_accounts_user_idx",
        "auth_sessions_user_idx",
        "auth_verifications_identifier_idx",
      ]),
    );
    expect(foreignReferences).toEqual(
      expect.arrayContaining([
        { source: "auth_accounts", target: "auth_users" },
        { source: "auth_sessions", target: "auth_users" },
      ]),
    );
  });

  it("preserves required fields, database timestamps, and cascading ownership", () => {
    const requiredColumns = {
      auth_accounts: ["account_id", "provider_id", "user_id"],
      auth_sessions: ["expires_at", "token", "user_id"],
      auth_users: ["email", "name"],
      auth_verifications: ["expires_at", "identifier", "value"],
    } as const;

    for (const table of Object.values(authProviderPrivateSchema)) {
      const config = getTableConfig(table);
      const tableName = getTableName(table) as keyof typeof requiredColumns;
      const columns = new Map(
        config.columns.map((column) => [column.name, column]),
      );

      for (const columnName of requiredColumns[tableName]) {
        expect(
          columns.get(columnName)?.notNull,
          `${tableName}.${columnName}`,
        ).toBe(true);
      }
      for (const columnName of ["created_at", "updated_at"]) {
        const column = columns.get(columnName);
        expect(column?.notNull, `${tableName}.${columnName} nullability`).toBe(
          true,
        );
        expect(column?.hasDefault, `${tableName}.${columnName} default`).toBe(
          true,
        );
        expect(
          column?.getSQLType(),
          `${tableName}.${columnName} type`,
        ).toContain("with time zone");
      }
    }

    for (const table of [
      authProviderPrivateSchema.auth_accounts,
      authProviderPrivateSchema.auth_sessions,
    ]) {
      const [userReference] = getTableConfig(table).foreignKeys;
      if (userReference === undefined) {
        throw new Error(`${getTableName(table)} is missing its user reference`);
      }
      expect(userReference.onDelete).toBe("cascade");
      expect(getTableName(userReference.reference().foreignTable)).toBe(
        "auth_users",
      );
    }
  });

  it("keeps the canonical identity provider-neutral with nullable unique email", () => {
    const config = getTableConfig(identityUsers);
    const columns = new Map(
      config.columns.map((column) => [column.name, column]),
    );
    const normalizedEmailIndex = config.indexes.find(
      (index) => index.config.name === "identity_users_normalized_email_unique",
    );
    const subjectIndex = config.indexes.find(
      (index) => index.config.name === "identity_users_subject_unique",
    );

    expect(columns.get("normalized_email")?.notNull).toBe(false);
    expect(normalizedEmailIndex?.config.unique).toBe(true);
    expect(normalizedEmailIndex?.config.where).toBeDefined();
    expect(subjectIndex?.config.unique).toBe(true);
    expect(columns.has("provider")).toBe(false);
    expect(columns.has("provider_id")).toBe(false);
  });

  it("prevents private schema imports and private provider fields outside its leaf", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packagesRoot = join(here, "..", "..");
    const roots = [
      "contracts/src",
      "domain/src",
      "sdk/src",
      "db/src/schema",
    ].map((path) => join(packagesRoot, path));
    const files = (await Promise.all(roots.map(walkTypeScript))).flat();
    const privateLeaf = join(
      packagesRoot,
      "db/src/schema/auth-provider-private.ts",
    );
    const violations: string[] = [];

    for (const file of files) {
      if (file === privateLeaf) {
        continue;
      }
      const source = await readFile(file, "utf8");
      if (
        /auth-provider-private|auth_(?:accounts|sessions|users|verifications)|(?:access|refresh|id)_token|password_hash|better-auth/iu.test(
          source,
        )
      ) {
        violations.push(relative(packagesRoot, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
