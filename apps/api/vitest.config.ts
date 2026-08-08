import baseVitestConfig from "@huoqiu/config/vitest/base";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    test: {
      hookTimeout: 10_000,
      include: ["test/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
      testTimeout: 10_000,
    },
  }),
);
