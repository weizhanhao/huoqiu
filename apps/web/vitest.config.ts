import baseVitestConfig from "@huoqiu/config/vitest/base";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    /*
     * 五组浏览器文件会并行启动 Vite 与 Chrome。满负载时 20 秒只够启动到一半，
     * 让本来通过的页面回归随机死在 beforeAll；给进程启动留出确定性余量。
     */
    hookTimeout: 40_000,
    oxc: {
      jsx: {
        runtime: "automatic",
      },
    },
  }),
);
