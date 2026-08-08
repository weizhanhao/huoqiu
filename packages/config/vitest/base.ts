import { defineConfig } from "vitest/config";

const baseVitestConfig = defineConfig({
  test: {
    clearMocks: true,
    passWithNoTests: false,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

export default baseVitestConfig;
