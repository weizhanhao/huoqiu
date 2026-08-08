import { defineConfig } from "vitest/config";

const baseVitestConfig = defineConfig({
  test: {
    clearMocks: true,
    hookTimeout: 20_000,
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 20_000,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

export default baseVitestConfig;
