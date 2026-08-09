import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadMigrationFiles, runMigrations } from "../../scripts/migrate.mjs";
import {
  catalogSnapshot,
  connect,
  POSTGRES_IMAGE,
  startPostgresHarness,
  type PostgresHarness,
} from "./test-postgres.js";

const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

describe.sequential("M1 PostgreSQL migration replay", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgresHarness();
  }, 70_000);

  afterAll(async () => {
    if (harness !== undefined) {
      await harness.stop();
    }
  }, 20_000);

  it("uses only the immutable inventoried PostgreSQL 17 image", () => {
    expect(POSTGRES_IMAGE).toContain("postgres:17.10-bookworm@sha256:");
    expect(process.env.TESTCONTAINERS_RYUK_DISABLED).toBe("true");
  });

  it("keeps prerequisites before generated foundation DDL and custom invariants", async () => {
    const [prerequisites, foundation, invariants] = await loadMigrationFiles();
    expect(prerequisites?.sql.trimStart()).toMatch(
      /^CREATE EXTENSION IF NOT EXISTS pg_trgm;/u,
    );
    expect(prerequisites?.sql).not.toMatch(/CREATE (?:TABLE|INDEX)/iu);
    expect(foundation?.sql.match(/CREATE TABLE/gmu)).toHaveLength(44);
    expect(foundation?.sql.match(/gin_trgm_ops/gmu)).toHaveLength(5);
    expect(invariants?.sql).not.toMatch(/CREATE TABLE/iu);
    expect(invariants?.sql).toContain("market_quotes_append_only");
  });

  it("replays twice and produces identical catalogs in two independent empty databases", async () => {
    const [firstUrl, secondUrl] = await Promise.all([
      harness.createDatabase("m1_replay_a"),
      harness.createDatabase("m1_replay_b"),
    ]);
    const first = connect(firstUrl);
    const second = connect(secondUrl);

    try {
      const firstRun = await runMigrations(first);
      const beforeReplayCatalog = await catalogSnapshot(first);
      const replay = await runMigrations(first);
      const afterReplayCatalog = await catalogSnapshot(first);
      await runMigrations(second);

      expect(firstRun.applied).toEqual([
        "0000_m1_prerequisites.sql",
        "0001_m1_foundation.sql",
        "0002_m1_invariants.sql",
      ]);
      expect(replay).toMatchObject({ applied: [], skipped: 3 });
      expect(afterReplayCatalog).toBe(beforeReplayCatalog);

      const tableRows = await first<{ readonly count: string }[]>`
        select count(*)::text as count
        from pg_catalog.pg_tables
        where schemaname = 'public'
      `;
      expect(Number(tableRows[0]?.count)).toBe(44);

      const extensionRows = await first`
        select extversion from pg_extension where extname = 'pg_trgm'
      `;
      expect(extensionRows).toHaveLength(1);

      const trgmIndexes = await first<{ readonly indexname: string }[]>`
        select distinct i.relname as indexname
        from pg_index x
        join pg_class i on i.oid = x.indexrelid
        join lateral unnest(x.indclass) opclass_oid on true
        join pg_opclass opc on opc.oid = opclass_oid
        where opc.opcname = 'gin_trgm_ops'
        order by i.relname
      `;
      expect(trgmIndexes.map((row) => row.indexname)).toEqual([
        "instruments_aliases_trgm_idx",
        "instruments_name_pinyin_trgm_idx",
        "instruments_name_trgm_idx",
        "listings_symbol_aliases_trgm_idx",
        "listings_symbol_trgm_idx",
      ]);

      const files = await loadMigrationFiles();
      const history = await first<{ readonly hash: string }[]>`
        select hash from drizzle.__drizzle_migrations order by id
      `;
      expect(history.map((row) => row.hash)).toEqual(
        files.map((file) => sha256(file.sql)),
      );
      expect(afterReplayCatalog).toBe(await catalogSnapshot(second));
    } finally {
      await Promise.all([
        first.end({ timeout: 5 }),
        second.end({ timeout: 5 }),
      ]);
    }
  }, 60_000);

  it("fails closed before business DDL when pg_trgm cannot be installed", async () => {
    const databaseUrl = await harness.createDatabase("m1_restricted");
    const admin = connect(databaseUrl);
    const role = "m1_restricted_login";
    const password = "restricted_test_only_password";

    try {
      await admin.unsafe(`REVOKE CREATE ON DATABASE m1_restricted FROM PUBLIC`);
      await admin.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
      await admin.unsafe(`CREATE SCHEMA drizzle AUTHORIZATION ${role}`);
      await admin.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
      const restricted = connect(
        harness.databaseUrl("m1_restricted", { password, user: role }),
      );
      try {
        await expect(runMigrations(restricted)).rejects.toThrow(
          /0000_m1_prerequisites.*permission denied/u,
        );
      } finally {
        await restricted.end({ timeout: 5 });
      }

      const businessTables = await admin`
        select tablename from pg_catalog.pg_tables
        where schemaname = 'public'
      `;
      const history = await admin`
        select hash from drizzle.__drizzle_migrations
      `;
      expect(businessTables).toEqual([]);
      expect(history).toEqual([]);
    } finally {
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  it("enforces append-only facts, monotonic delivery state, and numeric checks with real SQL", async () => {
    const databaseUrl = await harness.createDatabase("m1_invariants");
    const sql = connect(databaseUrl);
    const eventId = "00000000-0000-4000-8000-000000000001";
    try {
      await runMigrations(sql);
      await sql`
        insert into market_observations
          (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
        values
          ('observation-1', 'huoqiu-synthetic', 'listing-1', 1, 0, now(), 10, ${sql.json({})})
      `;
      await sql`
        insert into market_quotes
          (id, observation_id, provider, listing_id, sequence, revision, quoted_at, last_price)
        values
          ('quote-1', 'observation-1', 'huoqiu-synthetic', 'listing-1', 1, 0, now(), 10)
      `;
      await sql`
        insert into market_bars
          (id, provider, listing_id, interval, starts_at, ends_at,
           open_price, high_price, low_price, close_price, volume, revision)
        values
          ('bar-1', 'huoqiu-synthetic', 'listing-1', '1d', now() - interval '1 day', now(),
           10, 12, 9, 11, 100, 0)
      `;
      await sql`
        insert into portfolios (id, owner_id, name, base_currency)
        values ('portfolio-1', 'identity-1', 'Synthetic portfolio', 'CNY')
      `;
      await sql`
        insert into portfolio_ledger_entries
          (id, portfolio_id, client_request_id, entry_type, amount, fees, currency, posted_at)
        values
          ('ledger-1', 'portfolio-1', 'request-1', 'opening_cash', 1000, 0, 'CNY', now())
      `;

      for (const [table, id] of [
        ["market_observations", "observation-1"],
        ["market_quotes", "quote-1"],
        ["market_bars", "bar-1"],
        ["portfolio_ledger_entries", "ledger-1"],
      ] as const) {
        await expect(
          sql.unsafe(`update "${table}" set id = id where id = $1`, [id]),
        ).rejects.toThrow("M1_APPEND_ONLY");
        await expect(
          sql.unsafe(`delete from "${table}" where id = $1`, [id]),
        ).rejects.toThrow("M1_APPEND_ONLY");
      }

      await sql`
        insert into outbox_events
          (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
           payload, occurred_at, attempts)
        values
          (${eventId}, 'fixture.created', 'fixture', 'fixture-1', 1,
           ${sql.json({ fixture: true })}, now(), 0)
      `;
      await sql`
        update outbox_events set attempts = 1, published_at = now()
        where event_id = ${eventId}
      `;
      await expect(
        sql`update outbox_events set attempts = 0 where event_id = ${eventId}`,
      ).rejects.toThrow("M1_OUTBOX_MONOTONIC");
      await expect(
        sql`update outbox_events set payload = ${sql.json({ fixture: false })} where event_id = ${eventId}`,
      ).rejects.toThrow("M1_OUTBOX_MONOTONIC");
      await expect(
        sql`update outbox_events set published_at = null where event_id = ${eventId}`,
      ).rejects.toThrow("M1_OUTBOX_MONOTONIC");
      await expect(
        sql`delete from outbox_events where event_id = ${eventId}`,
      ).rejects.toThrow("M1_OUTBOX_MONOTONIC");

      await sql`
        insert into inbox_receipts
          (id, consumer, event_id, received_at)
        values ('receipt-1', 'fixture-consumer', ${eventId}, now())
      `;
      await sql`
        update inbox_receipts set processed_at = now(), outcome = 'processed'
        where id = 'receipt-1'
      `;
      await expect(
        sql`update inbox_receipts set outcome = 'failed' where id = 'receipt-1'`,
      ).rejects.toThrow("M1_INBOX_MONOTONIC");
      await expect(
        sql`update inbox_receipts set processed_at = null, outcome = null where id = 'receipt-1'`,
      ).rejects.toThrow("M1_INBOX_MONOTONIC");
      await expect(
        sql`delete from inbox_receipts where id = 'receipt-1'`,
      ).rejects.toThrow("M1_INBOX_MONOTONIC");

      await expect(sql`
        insert into market_observations
          (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
        values ('bad-observation', 'huoqiu-synthetic', 'listing-1', 0, 0, now(), 1, ${sql.json({})})
      `).rejects.toThrow("market_observations_sequence_check");
      await sql`
        insert into market_observations
          (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
        values ('observation-2', 'huoqiu-synthetic', 'listing-1', 2, 0, now(), 1, ${sql.json({})})
      `;
      await expect(sql`
        insert into market_quotes
          (id, observation_id, provider, listing_id, sequence, revision,
           quoted_at, bid_quantity, last_price)
        values ('bad-quote', 'observation-2', 'huoqiu-synthetic', 'listing-1', 2, 0,
                now(), -1, 1)
      `).rejects.toThrow("market_quotes_quantities_check");
      await expect(sql`
        insert into market_bars
          (id, provider, listing_id, interval, starts_at, ends_at,
           open_price, high_price, low_price, close_price, volume, revision)
        values ('bad-bar', 'huoqiu-synthetic', 'listing-1', '1d', now(), now() - interval '1 day',
                10, 9, 12, 11, -1, 0)
      `).rejects.toThrow("market_bars_time_check");
      await expect(sql`
        insert into portfolio_ledger_entries
          (id, portfolio_id, client_request_id, entry_type, amount, fees, currency, posted_at)
        values ('bad-ledger', 'portfolio-1', 'request-2', 'fee', -1, -1, 'CNY', now())
      `).rejects.toThrow("portfolio_ledger_fees_check");
      await expect(sql`
        insert into identity_users (id, subject, status, roles)
        values ('bad-user', 'bad-subject', 'unknown', '[]'::jsonb)
      `).rejects.toThrow("identity_users_status_check");
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 40_000);
});
