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

const expectSqlState = async (
  operation: PromiseLike<unknown>,
  code: "23503" | "23505" | "23514" | "55000",
): Promise<void> => {
  await expect(operation).rejects.toMatchObject({ code });
};

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
    expect(foundation?.sql).toContain('"watermark_sequence" bigint NOT NULL');
    expect(foundation?.sql).not.toContain('"watermark_at"');
    expect(foundation?.sql).toContain(
      "\"cash_balance\" numeric(38, 18) DEFAULT '0' NOT NULL",
    );
    expect(invariants?.sql).not.toMatch(/CREATE TABLE/iu);
    expect(invariants?.sql).toContain("market_quotes_append_only");
    expect(invariants?.sql).toContain("notification_read_state_monotonic");
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

  it("enforces domain, lineage, append-only, and monotonic invariants with stable SQLSTATEs", async () => {
    const databaseUrl = await harness.createDatabase("m1_invariants");
    const sql = connect(databaseUrl);
    const eventId = "00000000-0000-4000-8000-000000000001";
    try {
      await runMigrations(sql);
      await sql`
        insert into exchanges (id, code, name, market, timezone)
        values ('exchange-1', 'SYN', 'Synthetic exchange', 'SYNTHETIC', 'UTC')
      `;
      await sql`
        insert into instruments
          (id, name, name_pinyin, aliases, instrument_type, currency, status)
        values
          ('instrument-1', 'Synthetic instrument', 'synthetic', '[]'::jsonb,
           'stock', 'CNY', 'active')
      `;
      await sql`
        insert into listings
          (id, instrument_id, exchange_id, market, symbol, symbol_aliases, currency, status)
        values
          ('listing-1', 'instrument-1', 'exchange-1', 'SYNTHETIC', 'SYN1',
           '[]'::jsonb, 'CNY', 'active')
      `;
      await sql`
        update instruments set status = 'inactive' where id = 'instrument-1'
      `;
      await sql`
        update instruments set status = 'active' where id = 'instrument-1'
      `;
      await expectSqlState(
        sql`update instruments set status = 'unknown' where id = 'instrument-1'`,
        "23514",
      );
      for (const status of ["halted", "closed", "active"] as const) {
        await sql.unsafe(`update listings set status = $1 where id = $2`, [
          status,
          "listing-1",
        ]);
      }
      await expectSqlState(
        sql`
          insert into listings
            (id, instrument_id, exchange_id, market, symbol, symbol_aliases, currency, status)
          values
            ('listing-bad-status', 'instrument-1', 'exchange-1', 'SYNTHETIC',
             'BAD', '[]'::jsonb, 'CNY', 'open')
        `,
        "23514",
      );

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
        insert into portfolios (id, owner_id, name, base_currency, cash_balance)
        values ('portfolio-1', 'identity-1', 'Synthetic portfolio', 'CNY', 1000)
      `;
      await sql`
        insert into portfolio_ledger_entries
          (id, portfolio_id, client_request_id, entry_type, amount, fees, currency, posted_at)
        values
          ('ledger-1', 'portfolio-1', 'request-1', 'fee', -1, 0, 'CNY', now())
      `;

      await sql`
        insert into content_posts
          (id, author_id, client_request_id, kind, body)
        values ('post-1', 'identity-1', 'post-request-1', 'article', 'Fixture')
      `;
      await sql`
        insert into content_post_revisions
          (id, post_id, revision, editor_id, body)
        values ('post-revision-1', 'post-1', 1, 'identity-1', 'Fixture')
      `;
      await sql`
        insert into moderation_reports
          (id, target_type, target_id, reporter_id, reason_code)
        values ('report-1', 'post', 'post-1', 'identity-1', 'fixture')
      `;
      await sql`
        insert into moderation_cases (id, primary_report_id)
        values ('case-1', 'report-1')
      `;
      await sql`
        insert into moderation_evidence
          (id, case_id, evidence_type, storage_reference, digest,
           submitted_by_id, snapshot)
        values ('evidence-1', 'case-1', 'snapshot', 'fixture://evidence',
                'digest-1', 'identity-1', '{}'::jsonb)
      `;
      await sql`
        insert into moderation_decisions
          (id, case_id, reviewer_id, action, reason)
        values ('decision-1', 'case-1', 'reviewer-1', 'allow', 'fixture')
      `;
      await sql`
        insert into moderation_audit
          (id, case_id, actor_id, action, details)
        values ('moderation-audit-1', 'case-1', 'reviewer-1', 'reviewed', '{}'::jsonb)
      `;
      await sql`
        insert into feed_channels (id, key, title)
        values ('channel-1', 'fixture', 'Fixture')
      `;
      await sql`
        insert into feed_ranking_snapshots
          (id, channel_id, source_event_id, algorithm_version, ranked_items, computed_at)
        values ('ranking-1', 'channel-1', '00000000-0000-4000-8000-000000000020',
                'fixture-v1', '[]'::jsonb, now())
      `;
      await sql`
        insert into notifications
          (id, recipient_id, canonical_key, kind, payload, source_event_id)
        values ('notification-1', 'identity-1', 'fixture-1', 'fixture', '{}'::jsonb,
                '00000000-0000-4000-8000-000000000021')
      `;
      await sql`
        insert into notification_delivery_attempts
          (id, notification_id, channel, attempt, status, attempted_at)
        values ('delivery-attempt-1', 'notification-1', 'in_app', 1, 'delivered', now())
      `;
      await sql`
        insert into portfolio_valuation_snapshots
          (id, portfolio_id, total_value, cash_value, currency, as_of, source_event_id)
        values ('valuation-1', 'portfolio-1', 1000, 1000, 'CNY', now(),
                '00000000-0000-4000-8000-000000000022')
      `;
      await sql`
        insert into operations_admin_audit
          (id, event_id, actor_id, action, target_type, target_id, details, occurred_at)
        values ('admin-audit-1', '00000000-0000-4000-8000-000000000023',
                'admin-1', 'fixture', 'post', 'post-1', '{}'::jsonb, now())
      `;
      await sql`
        insert into idempotency_records
          (id, scope, key, request_hash, response_status, expires_at)
        values ('idempotency-1', 'fixture', 'request-1', 'hash-1', 'completed',
                now() + interval '1 day')
      `;

      const appendOnlyRows = [
        ["content_post_revisions", "post-revision-1"],
        ["feed_ranking_snapshots", "ranking-1"],
        ["idempotency_records", "idempotency-1"],
        ["market_bars", "bar-1"],
        ["market_observations", "observation-1"],
        ["market_quotes", "quote-1"],
        ["moderation_audit", "moderation-audit-1"],
        ["moderation_decisions", "decision-1"],
        ["moderation_evidence", "evidence-1"],
        ["notification_delivery_attempts", "delivery-attempt-1"],
        ["operations_admin_audit", "admin-audit-1"],
        ["portfolio_ledger_entries", "ledger-1"],
        ["portfolio_valuation_snapshots", "valuation-1"],
      ] as const;
      const appendOnlyTriggerTables = await sql<
        { readonly table_name: string }[]
      >`
        select distinct event_object_table as table_name
        from information_schema.triggers
        where trigger_schema = 'public'
          and trigger_name like '%\\_append\\_only' escape '\\'
        order by event_object_table
      `;
      expect(appendOnlyTriggerTables.map((row) => row.table_name)).toEqual(
        [...appendOnlyRows].map(([table]) => table).sort(),
      );

      for (const [table, id] of appendOnlyRows) {
        await expectSqlState(
          sql.unsafe(`update "${table}" set id = id where id = $1`, [id]),
          "55000",
        );
        await expectSqlState(
          sql.unsafe(`delete from "${table}" where id = $1`, [id]),
          "55000",
        );
      }

      await expectSqlState(
        sql`
          insert into market_observations
            (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
          values ('observation-bad-sequence', 'huoqiu-synthetic', 'listing-1', 0, 0,
                  now(), 1, ${sql.json({})})
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_observations
            (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
          values ('observation-bad-revision', 'huoqiu-synthetic', 'listing-1', 2, -1,
                  now(), 1, ${sql.json({})})
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_observations
            (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
          values ('observation-bad-value', 'huoqiu-synthetic', 'listing-1', 3, 0,
                  now(), -1, ${sql.json({})})
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_observations
            (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
          values ('observation-bad-raw', 'huoqiu-synthetic', 'listing-1', 4, 0,
                  now(), 1, ${sql.json([])})
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_observations
            (id, provider, listing_id, sequence, revision, observed_at, observed_value, raw)
          values ('observation-duplicate-lineage', 'huoqiu-synthetic', 'listing-1', 1, 0,
                  now(), 10, ${sql.json({})})
        `,
        "23505",
      );

      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, last_price)
          values ('quote-bad-sequence', 'observation-1', 'huoqiu-synthetic',
                  'listing-1', 0, 0, now(), 1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, last_price)
          values ('quote-bad-revision', 'observation-1', 'huoqiu-synthetic',
                  'listing-1', 1, -1, now(), 1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, last_price)
          values ('quote-bad-price', 'observation-1', 'huoqiu-synthetic',
                  'listing-1', 1, 0, now(), -1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, bid_price, ask_price, last_price)
          values ('quote-crossed', 'observation-1', 'huoqiu-synthetic',
                  'listing-1', 1, 0, now(), 12, 11, 11)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, bid_quantity, last_price)
          values ('quote-bad-quantity', 'observation-1', 'huoqiu-synthetic',
                  'listing-1', 1, 0, now(), -1, 1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_quotes
            (id, observation_id, provider, listing_id, sequence, revision,
             quoted_at, last_price)
          values ('quote-bad-lineage', 'observation-1', 'other-provider',
                  'listing-1', 1, 0, now(), 1)
        `,
        "23503",
      );

      await expectSqlState(
        sql`
          insert into market_bars
            (id, provider, listing_id, interval, starts_at, ends_at,
             open_price, high_price, low_price, close_price, volume, revision)
          values ('bar-bad-revision', 'huoqiu-synthetic', 'listing-1', '1d',
                  now() - interval '1 day', now(), 10, 12, 9, 11, 100, -1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_bars
            (id, provider, listing_id, interval, starts_at, ends_at,
             open_price, high_price, low_price, close_price, volume, revision)
          values ('bar-bad-time', 'huoqiu-synthetic', 'listing-1', '1d', now(),
                  now() - interval '1 day', 10, 12, 9, 11, 100, 0)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into market_bars
            (id, provider, listing_id, interval, starts_at, ends_at,
             open_price, high_price, low_price, close_price, volume, revision)
          values ('bar-bad-values', 'huoqiu-synthetic', 'listing-1', '1d',
                  now() - interval '1 day', now(), 10, 9, 12, 11, -1, 0)
        `,
        "23514",
      );

      await expectSqlState(
        sql`
          insert into portfolios (id, owner_id, name, base_currency, cash_balance)
          values ('portfolio-negative-cash', 'identity-1', 'Invalid', 'CNY', -1)
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into portfolio_ledger_entries
            (id, portfolio_id, client_request_id, entry_type, amount, fees,
             currency, posted_at)
          values ('ledger-bad-kind', 'portfolio-1', 'request-kind', 'opening_cash',
                  1000, 0, 'CNY', now())
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into portfolio_ledger_entries
            (id, portfolio_id, client_request_id, entry_type, listing_id, price,
             amount, fees, currency, posted_at)
          values ('ledger-bad-price', 'portfolio-1', 'request-price', 'buy',
                  'listing-1', -1, -1, 0, 'CNY', now())
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into portfolio_ledger_entries
            (id, portfolio_id, client_request_id, entry_type, amount, fees,
             currency, posted_at)
          values ('ledger-bad-fees', 'portfolio-1', 'request-fees', 'fee',
                  -1, -1, 'CNY', now())
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into portfolio_ledger_entries
            (id, portfolio_id, client_request_id, entry_type, amount, fees,
             currency, posted_at)
          values ('ledger-bad-reversal', 'portfolio-1', 'request-reversal',
                  'reversal', 1, 0, 'CNY', now())
        `,
        "23514",
      );

      for (const operation of [
        sql`
          insert into outbox_events
            (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
             payload, occurred_at, attempts)
          values ('00000000-0000-4000-8000-000000000010', 'fixture.invalid',
                  'fixture', 'fixture-10', 0, '{}'::jsonb, now(), 0)
        `,
        sql`
          insert into outbox_events
            (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
             payload, occurred_at, attempts)
          values ('00000000-0000-4000-8000-000000000011', 'fixture.invalid',
                  'fixture', 'fixture-11', 1, '{}'::jsonb, now(), -1)
        `,
        sql`
          insert into outbox_events
            (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
             payload, occurred_at, attempts)
          values ('00000000-0000-4000-8000-000000000012', 'fixture.invalid',
                  'fixture', 'fixture-12', 1, '"scalar"'::jsonb, now(), 0)
        `,
        sql`
          insert into outbox_events
            (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
             payload, occurred_at, published_at, attempts)
          values ('00000000-0000-4000-8000-000000000013', 'fixture.invalid',
                  'fixture', 'fixture-13', 1, '{}'::jsonb, now(),
                  now() - interval '1 minute', 0)
        `,
      ]) {
        await expectSqlState(operation, "23514");
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
      await expectSqlState(
        sql`update outbox_events set attempts = 0 where event_id = ${eventId}`,
        "23514",
      );
      await expectSqlState(
        sql`update outbox_events set payload = ${sql.json({ fixture: false })} where event_id = ${eventId}`,
        "55000",
      );
      await expectSqlState(
        sql`update outbox_events set published_at = null where event_id = ${eventId}`,
        "23514",
      );
      await expectSqlState(
        sql`delete from outbox_events where event_id = ${eventId}`,
        "55000",
      );
      await expectSqlState(
        sql`
          insert into outbox_events
            (event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
             payload, occurred_at, attempts)
          values (${eventId}, 'fixture.created', 'fixture', 'fixture-duplicate', 1,
                  '{}'::jsonb, now(), 0)
        `,
        "23505",
      );

      await expectSqlState(
        sql`
          insert into inbox_receipts
            (id, consumer, event_id, received_at, processed_at)
          values ('receipt-bad-outcome', 'fixture-consumer', ${eventId}, now(), now())
        `,
        "23514",
      );
      await expectSqlState(
        sql`
          insert into inbox_receipts
            (id, consumer, event_id, received_at, processed_at, outcome)
          values ('receipt-bad-time', 'fixture-consumer', ${eventId}, now(),
                  now() - interval '1 minute', 'processed')
        `,
        "23514",
      );

      await sql`
        insert into inbox_receipts
          (id, consumer, event_id, received_at)
        values ('receipt-1', 'fixture-consumer', ${eventId}, now())
      `;
      await sql`
        update inbox_receipts set processed_at = now(), outcome = 'processed'
        where id = 'receipt-1'
      `;
      await expectSqlState(
        sql`update inbox_receipts set outcome = 'failed' where id = 'receipt-1'`,
        "23514",
      );
      await expectSqlState(
        sql`update inbox_receipts set processed_at = null, outcome = null where id = 'receipt-1'`,
        "23514",
      );
      await expectSqlState(
        sql`update inbox_receipts set consumer = 'other-consumer' where id = 'receipt-1'`,
        "55000",
      );
      await expectSqlState(
        sql`delete from inbox_receipts where id = 'receipt-1'`,
        "55000",
      );

      await expectSqlState(
        sql`
          insert into notification_read_state
            (id, recipient_id, watermark_sequence)
          values ('read-state-negative', 'identity-1', -1)
        `,
        "23514",
      );
      await sql`
        insert into notification_read_state
          (id, recipient_id, watermark_sequence)
        values ('read-state-1', 'identity-1', 10)
      `;
      await sql`
        update notification_read_state
        set watermark_sequence = greatest(watermark_sequence, 5)
        where id = 'read-state-1'
      `;
      const watermark = await sql<{ readonly watermark_sequence: string }[]>`
        select watermark_sequence::text as watermark_sequence
        from notification_read_state
        where id = 'read-state-1'
      `;
      expect(watermark).toEqual([{ watermark_sequence: "10" }]);
      await expectSqlState(
        sql`
          update notification_read_state set watermark_sequence = 9
          where id = 'read-state-1'
        `,
        "23514",
      );
      await sql`
        update notification_read_state set watermark_sequence = 11
        where id = 'read-state-1'
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 50_000);
});
