import { readFile } from "node:fs/promises";

import postgres, { type Sql } from "postgres";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import { parseDocument } from "yaml";

export const POSTGRES_IMAGE =
  "docker.io/library/postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f";

const POSTGRES_USER = "huoqiu_test";
const POSTGRES_PASSWORD = "huoqiu_test_only_password";

interface ArtifactInventory {
  readonly container_images: readonly {
    readonly immutable_reference: string;
    readonly repository: string;
  }[];
  readonly schema_version: number;
}

export interface PostgresHarness {
  readonly admin: Sql;
  readonly container: StartedTestContainer;
  createDatabase(name: string): Promise<string>;
  databaseUrl(
    name: string,
    credentials?: { readonly password: string; readonly user: string },
  ): string;
  stop(): Promise<void>;
}

export const assertPinnedPostgresImage = async (): Promise<void> => {
  const inventoryUrl = new URL(
    "../../../../security/artifact-inventory.yml",
    import.meta.url,
  );
  const document = parseDocument(await readFile(inventoryUrl, "utf8"), {
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error("POSTGRES_IMAGE_INVENTORY_INVALID");
  }
  const inventory = document.toJS() as ArtifactInventory;
  const postgresImages = inventory.container_images.filter(
    (entry) => entry.repository === "docker.io/library/postgres",
  );

  if (
    inventory.schema_version !== 2 ||
    postgresImages.length !== 1 ||
    postgresImages[0]?.immutable_reference !== POSTGRES_IMAGE
  ) {
    throw new Error("POSTGRES_IMAGE_INVENTORY_MISMATCH");
  }
};

const safeDatabaseName = (name: string): string => {
  if (!/^[a-z][a-z0-9_]{0,40}$/u.test(name)) {
    throw new Error(`UNSAFE_DATABASE_NAME:${name}`);
  }
  return name;
};

export const startPostgresHarness = async (): Promise<PostgresHarness> => {
  await assertPinnedPostgresImage();
  process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

  let container: StartedTestContainer;
  try {
    container = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({
        POSTGRES_DB: "postgres",
        POSTGRES_PASSWORD,
        POSTGRES_USER,
      })
      .withExposedPorts(5432)
      .withStartupTimeout(60_000)
      .withWaitStrategy(
        Wait.forLogMessage(
          /database system is ready to accept connections/u,
          2,
        ),
      )
      .start();
  } catch (error) {
    throw new Error(
      "DOCKER_REQUIRED: PostgreSQL 17 container failed to start",
      {
        cause: error,
      },
    );
  }

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const databaseUrl = (
    name: string,
    credentials = { password: POSTGRES_PASSWORD, user: POSTGRES_USER },
  ): string =>
    `postgres://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@${host}:${String(port)}/${safeDatabaseName(name)}`;
  const admin = postgres(databaseUrl("postgres"), {
    max: 1,
    onnotice: () => undefined,
  });

  return {
    admin,
    container,
    async createDatabase(name) {
      const safeName = safeDatabaseName(name);
      await admin.unsafe(`CREATE DATABASE "${safeName}"`);
      return databaseUrl(safeName);
    },
    databaseUrl,
    async stop() {
      await admin.end({ timeout: 5 });
      await container.stop({
        remove: true,
        removeVolumes: true,
        timeout: 10_000,
      });
    },
  };
};

export const connect = (url: string): Sql =>
  postgres(url, { max: 1, onnotice: () => undefined });

export const allBusinessTableCounts = async (
  sql: Sql,
): Promise<Readonly<Record<string, number>>> => {
  const tables = await sql<{ readonly tablename: string }[]>`
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  `;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const rows = await sql.unsafe<{ readonly count: string }[]>(
      `select count(*)::text as count from "public"."${tablename}"`,
    );
    counts[tablename] = Number(rows[0]?.count ?? "0");
  }
  return counts;
};

export const catalogSnapshot = async (sql: Sql): Promise<string> => {
  const [columns, constraints, indexes, triggers] = await Promise.all([
    sql`
      select table_schema, table_name, ordinal_position, column_name,
             data_type, udt_name, is_nullable, coalesce(column_default, '') as column_default
      from information_schema.columns
      where table_schema in ('public', 'drizzle')
      order by table_schema, table_name, ordinal_position
    `,
    sql`
      select n.nspname as schema_name, c.relname as table_name,
             con.conname, con.contype, pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'drizzle')
      order by n.nspname, c.relname, con.conname
    `,
    sql`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname in ('public', 'drizzle')
      order by schemaname, tablename, indexname
    `,
    sql`
      select event_object_schema, event_object_table, trigger_name,
             action_timing, event_manipulation, action_statement
      from information_schema.triggers
      where event_object_schema in ('public', 'drizzle')
      order by event_object_schema, event_object_table, trigger_name, event_manipulation
    `,
  ]);
  return JSON.stringify({ columns, constraints, indexes, triggers });
};
