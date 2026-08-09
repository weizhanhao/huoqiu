import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../scripts/migrate.mjs";
import { seedM1Fixture } from "../../src/seed/m1.v1.js";
import {
  allBusinessTableCounts,
  connect,
  startPostgresHarness,
  type PostgresHarness,
} from "./test-postgres.js";

const negativeFixtureNames = [
  "m1-forbidden-surface.json",
  "m1-pii-email.json",
  "m1-unauthorized-source.json",
] as const;

const loadNegativeFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await readFile(
      new URL(`../../../contracts/fixtures/negative/${name}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;

describe.sequential("M1 fixture preflight rejection", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgresHarness();
  }, 70_000);

  afterAll(async () => {
    if (harness !== undefined) {
      await harness.stop();
    }
  }, 20_000);

  it.each(negativeFixtureNames)(
    "rejects %s before creating a client or issuing a query",
    async (name) => {
      const createClient = vi.fn();
      await expect(
        seedM1Fixture(await loadNegativeFixture(name), { createClient }),
      ).rejects.toThrow();
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it("leaves all 44 real tables unchanged for every rejected fixture", async () => {
    const url = await harness.createDatabase("m1_seed_rejected");
    const sql = connect(url);
    try {
      await runMigrations(sql);
      const before = await allBusinessTableCounts(sql);
      expect(Object.keys(before)).toHaveLength(44);

      for (const name of negativeFixtureNames) {
        const createClient = vi.fn(() => sql);
        await expect(
          seedM1Fixture(await loadNegativeFixture(name), { createClient }),
        ).rejects.toThrow();
        expect(createClient).not.toHaveBeenCalled();
        expect(await allBusinessTableCounts(sql)).toEqual(before);
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 40_000);
});
