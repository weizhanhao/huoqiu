import type postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { runSeedCli } from "../../scripts/seed.mjs";

const result = {
  exchanges: 1,
  feedChannels: 4,
  identityProfiles: 2,
  identityUsers: 2,
  instruments: 1,
  listings: 1,
  persistedCards: 0,
} as const;

describe("M1 seed CLI connection boundary", () => {
  it("does not construct PostgreSQL before seed preflight enters its lazy client factory", async () => {
    const order: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = { end } as unknown as postgres.Sql;
    const createPostgres = vi.fn(() => {
      order.push("postgres");
      return sql;
    });
    const seed = vi.fn(async ({ createClient }) => {
      order.push("seed-preflight");
      await createClient();
      order.push("seed-write");
      return result;
    });

    await runSeedCli("postgres://fixture", {
      createPostgres,
      seed,
      write: vi.fn(),
    });

    expect(order).toEqual(["seed-preflight", "postgres", "seed-write"]);
    expect(createPostgres).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it("does not construct or close PostgreSQL when fixture preflight rejects", async () => {
    const createPostgres = vi.fn();
    const seed = vi.fn(async () => {
      throw new Error("FIXTURE_REJECTED");
    });

    await expect(
      runSeedCli("postgres://fixture", {
        createPostgres,
        seed,
        write: vi.fn(),
      }),
    ).rejects.toThrow("FIXTURE_REJECTED");
    expect(createPostgres).not.toHaveBeenCalled();
  });
});
