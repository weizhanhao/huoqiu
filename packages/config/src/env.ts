import { z } from "zod";

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  APP_ENV: z.enum(["local", "test", "staging", "production"]),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export const parseRuntimeEnv = (input: Record<string, unknown>): RuntimeEnv =>
  runtimeEnvSchema.parse(input);
