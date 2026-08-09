import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres, { type Sql } from "postgres";

const MIGRATION_NAMES = [
  "0000_m1_prerequisites.sql",
  "0001_m1_foundation.sql",
  "0002_m1_invariants.sql",
] as const;

export interface MigrationFile {
  readonly name: (typeof MIGRATION_NAMES)[number];
  readonly sql: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: number;
}

const defaultMigrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

export const migrationSha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

export const loadMigrationFiles = async (
  migrationDirectory = defaultMigrationDirectory,
): Promise<readonly MigrationFile[]> => {
  const actualNames = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(MIGRATION_NAMES)) {
    throw new Error(
      `MIGRATION_SET_MISMATCH expected=${MIGRATION_NAMES.join(",")} actual=${actualNames.join(",")}`,
    );
  }

  return Promise.all(
    MIGRATION_NAMES.map(async (name) => ({
      name,
      sql: await readFile(join(migrationDirectory, name), "utf8"),
    })),
  );
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runMigrations = async (
  sql: Sql,
  options: { readonly migrationDirectory?: string } = {},
): Promise<MigrationResult> => {
  const migrations = await loadMigrationFiles(options.migrationDirectory);

  const drizzleSchema = await sql<{ readonly exists: boolean }[]>`
    select exists (
      select 1 from pg_catalog.pg_namespace where nspname = 'drizzle'
    ) as exists
  `;
  if (drizzleSchema[0]?.exists !== true) {
    await sql.unsafe("CREATE SCHEMA drizzle");
  }
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL UNIQUE,
      created_at bigint NOT NULL
    )
  `);

  const history = await sql<{ readonly hash: string }[]>`
    select hash from drizzle.__drizzle_migrations order by id
  `;
  if (history.length > migrations.length) {
    throw new Error(
      `MIGRATION_HISTORY_AHEAD database=${String(history.length)} local=${String(migrations.length)}`,
    );
  }
  for (const [index, row] of history.entries()) {
    const local = migrations[index];
    if (local === undefined || row.hash !== migrationSha256(local.sql)) {
      throw new Error(
        `MIGRATION_HASH_MISMATCH ordinal=${String(index)} migration=${local?.name ?? "missing"}`,
      );
    }
  }

  const applied: string[] = [];
  for (const migration of migrations.slice(history.length)) {
    const hash = migrationSha256(migration.sql);
    try {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration.sql);
        await transaction`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          values (${hash}, ${Date.now()})
        `;
      });
    } catch (error) {
      throw new Error(
        `MIGRATION_FAILED ${migration.name}: ${errorText(error)}`,
        { cause: error },
      );
    }
    applied.push(migration.name);
  }

  return { applied, skipped: history.length };
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const result = await runMigrations(sql);
    process.stdout.write(
      `M1_MIGRATE PASS applied=${String(result.applied.length)} skipped=${String(result.skipped)}\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
