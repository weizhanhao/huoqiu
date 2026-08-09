import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: ["./src/schema/auth-provider-private.ts", "./src/schema/index.ts"],
  strict: true,
  verbose: true,
});
