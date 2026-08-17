import baseVitestConfig from "@huoqiu/config/vitest/base";
import { defineConfig, mergeConfig } from "vitest/config";

/*
 * 浏览器用例串行跑，其余照旧并行。
 *
 * 五个 *.browser.spec.ts 各自 spawn 一个 Vite 和一个 Chrome。并行时这十个进程
 * 一起抢 CPU，轮到谁超时取决于调度顺序——表现是每隔几次全量跑就冒出一两个
 * 「页面上一个控件都没有」的失败，重跑又好了。
 *
 * 那种失败最坏的地方不是它红，是它让「测试通过」这句话打了折：分不清是真回归
 * 还是又抽了一次。拆成两个 project，浏览器那组关掉 fileParallelism，代价是那
 * 五个文件依次跑，换来的是结论可信。
 */
const browserSpecs = "tests/**/*.browser.spec.ts";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    oxc: {
      jsx: {
        runtime: "automatic",
      },
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            exclude: ["**/node_modules/**", browserSpecs],
            name: "unit",
          },
        },
        {
          extends: true,
          test: {
            fileParallelism: false,
            include: [browserSpecs],
            name: "browser",
          },
        },
      ],
    },
  }),
);
