import baseVitestConfig from "@huoqiu/config/vitest/base";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const safeAreaContextMock = fileURLToPath(
  new URL("./tests/mocks/react-native-safe-area-context.tsx", import.meta.url),
);

/* Keychain 是设备能力，Node 里没有对应的原生模块。 */
const secureStoreMock = fileURLToPath(
  new URL("./tests/mocks/expo-secure-store.ts", import.meta.url),
);

/* 同理：expo-constants 要读设备上的原生全局对象。 */
const constantsMock = fileURLToPath(
  new URL("./tests/mocks/expo-constants.ts", import.meta.url),
);

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    /*
     * __DEV__ 是 React Native 打包器注入的构建期常量，Node 里没有。
     * expo-secure-store 会读它，于是任何 import 到会话层的用例都会在模块
     * 加载阶段抛 ReferenceError——报出来的是「__DEV__ is not defined」，
     * 和被测的东西毫无关系，很容易被当成用例本身写错。
     */
    define: { __DEV__: "true" },
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
        {
          find: /^expo-secure-store$/u,
          replacement: secureStoreMock,
        },
        {
          find: /^expo-constants$/u,
          replacement: constantsMock,
        },
      ],
    },
  }),
);
