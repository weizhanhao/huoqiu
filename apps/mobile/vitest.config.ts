import baseVitestConfig from "@huoqiu/config/vitest/base";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^react-native$/u,
          replacement: "react-native-web",
        },
      ],
    },
  }),
);
