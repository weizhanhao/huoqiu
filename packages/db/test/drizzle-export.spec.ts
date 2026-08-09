import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const drizzleKit = join(packageRoot, "node_modules/.bin/drizzle-kit");

describe("Drizzle Kit PostgreSQL export", () => {
  it("exports the real M1 schema without non-serializable defaults", async () => {
    const { stderr, stdout } = await execFileAsync(
      drizzleKit,
      ["export", "--config", "drizzle.config.ts"],
      {
        cwd: packageRoot,
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("Do not know how to serialize a BigInt");
    expect(stdout).toContain('CREATE TABLE "identity_users"');
    expect(stdout).toContain('CREATE TABLE "outbox_events"');
    expect(stdout).toContain('"name_pinyin" text NOT NULL');
    expect(stdout).toContain("\"aliases\" jsonb DEFAULT '[]'::jsonb NOT NULL");
    expect(stdout).toContain(
      "\"symbol_aliases\" jsonb DEFAULT '[]'::jsonb NOT NULL",
    );
    expect(stdout).toContain(
      'CREATE INDEX "instruments_name_trgm_idx" ON "instruments" USING gin ("name" gin_trgm_ops);',
    );
    expect(stdout).toContain(
      'CREATE INDEX "instruments_name_pinyin_trgm_idx" ON "instruments" USING gin ("name_pinyin" gin_trgm_ops);',
    );
    expect(stdout).toContain(
      'CREATE INDEX "instruments_aliases_trgm_idx" ON "instruments" USING gin (("aliases"::text) gin_trgm_ops);',
    );
    expect(stdout).toContain(
      'CREATE INDEX "listings_symbol_trgm_idx" ON "listings" USING gin ("symbol" gin_trgm_ops);',
    );
    expect(stdout).toContain(
      'CREATE INDEX "listings_symbol_aliases_trgm_idx" ON "listings" USING gin (("symbol_aliases"::text) gin_trgm_ops);',
    );
  });
});
