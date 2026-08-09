import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { seedM1 } from "../src/seed/m1.v1.js";

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const result = await seedM1({ createClient: () => sql });
    process.stdout.write(
      `M1_SEED PASS users=${String(result.identityUsers)} profiles=${String(result.identityProfiles)} exchanges=${String(result.exchanges)} instruments=${String(result.instruments)} listings=${String(result.listings)} channels=${String(result.feedChannels)} persistedCards=${String(result.persistedCards)}\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
