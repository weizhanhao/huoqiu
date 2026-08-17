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
      /*
       * 启动 Vite 与 Chrome 要时间，满负载时 20 秒只够启动到一半，本来通过的
       * 页面回归会随机死在 beforeAll。上面的串行已经拿掉了争抢，这一条是余量。
       *
       * 它原先写在 defineConfig 的根层。vitest 只认 test.hookTimeout，根层那个
       * 键 Vite 不认识也不报错——于是那次「已经调大了」其实一秒都没生效，
       * 而它看起来是修过的。
       */
      hookTimeout: 40_000,
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
