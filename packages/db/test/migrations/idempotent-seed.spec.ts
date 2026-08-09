import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../scripts/migrate.mjs";
import { seedM1 } from "../../src/seed/m1.v1.js";
import {
  allBusinessTableCounts,
  connect,
  startPostgresHarness,
  type PostgresHarness,
} from "./test-postgres.js";

describe.sequential("M1 fixture seed writer", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgresHarness();
  }, 70_000);

  afterAll(async () => {
    if (harness !== undefined) {
      await harness.stop();
    }
  }, 20_000);

  it("seeds one transaction twice without row growth and persists no cards", async () => {
    const url = await harness.createDatabase("m1_seed_twice");
    const sql = connect(url);
    try {
      await runMigrations(sql);
      const first = await seedM1({ createClient: () => sql });
      const beforeReplay = await allBusinessTableCounts(sql);
      const second = await seedM1({ createClient: () => sql });
      const afterReplay = await allBusinessTableCounts(sql);

      expect(first).toEqual({
        feedChannels: 4,
        identityProfiles: 2,
        identityUsers: 2,
        persistedCards: 0,
        exchanges: 1,
        instruments: 1,
        listings: 1,
      });
      expect(second).toEqual(first);
      expect(afterReplay).toEqual(beforeReplay);
      expect(beforeReplay).toMatchObject({
        exchanges: 1,
        feed_channels: 4,
        identity_profiles: 2,
        identity_users: 2,
        instruments: 1,
        listings: 1,
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 40_000);

  it("rolls back all prior writes when a stable id conflicts with different data", async () => {
    const url = await harness.createDatabase("m1_seed_conflict");
    const sql = connect(url);
    try {
      await runMigrations(sql);
      await sql`
        insert into exchanges (id, code, name, market, timezone)
        values ('exchange_syn_0001', 'WRONG', 'Wrong exchange', 'SYNTHETIC', 'UTC')
      `;
      const before = await allBusinessTableCounts(sql);

      await expect(seedM1({ createClient: () => sql })).rejects.toThrow(
        "SEED_CONFLICT exchanges#exchange_syn_0001",
      );
      expect(await allBusinessTableCounts(sql)).toEqual(before);
      expect(before.identity_users).toBe(0);
      expect(before.identity_profiles).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 40_000);
});
