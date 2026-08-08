import baseVitestConfig from "@huoqiu/config/vitest/base";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    oxc: {
      jsx: {
        runtime: "automatic",
      },
    },
  }),
);
