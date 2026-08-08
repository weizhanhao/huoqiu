import baseVitestConfig from "@huoqiu/config/vitest/base";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const safeAreaContextMock = fileURLToPath(
  new URL("./tests/mocks/react-native-safe-area-context.tsx", import.meta.url),
);

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^react-native-safe-area-context$/u,
          replacement: safeAreaContextMock,
        },
        {
          find: /^react-native$/u,
          replacement: "react-native-web",
        },
      ],
    },
  }),
);
