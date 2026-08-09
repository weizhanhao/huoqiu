import { fileURLToPath } from "node:url";

import postgres, { type Sql } from "postgres";

import {
  seedM1,
  type M1SeedResult,
  type SeedM1Options,
} from "../src/seed/m1.v1.js";

export interface SeedCliDependencies {
  readonly createPostgres?: (
    databaseUrl: string,
    options: { readonly max: number },
  ) => Sql;
  readonly seed?: (options: SeedM1Options) => Promise<M1SeedResult>;
  readonly write?: (line: string) => void;
}

export const runSeedCli = async (
  databaseUrl: string,
  dependencies: SeedCliDependencies = {},
): Promise<M1SeedResult> => {
  const createPostgres = dependencies.createPostgres ?? postgres;
  const seed = dependencies.seed ?? seedM1;
  const write =
    dependencies.write ??
    ((line: string): void => {
      process.stdout.write(line);
    });
  let sql: Sql | undefined;

  try {
    const result = await seed({
      createClient: () => {
        sql ??= createPostgres(databaseUrl, { max: 1 });
        return sql;
      },
    });
    write(
      `M1_SEED PASS users=${String(result.identityUsers)} profiles=${String(result.identityProfiles)} exchanges=${String(result.exchanges)} instruments=${String(result.instruments)} listings=${String(result.listings)} channels=${String(result.feedChannels)} persistedCards=${String(result.persistedCards)}\n`,
    );
    return result;
  } finally {
    if (sql !== undefined) {
      await sql.end({ timeout: 5 });
    }
  }
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  await runSeedCli(databaseUrl);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
