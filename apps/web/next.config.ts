import type { NextConfig } from "next";

import { assertZeroTrustStartupConfiguration } from "./src/zero-trust-configuration.ts";

assertZeroTrustStartupConfiguration(process.env);

/*
 * 发布构建写到独立目录，不能在运行中的 .next 上原地覆盖。
 *
 * Next 每次构建会清理 distDir；如果旧进程还在服务，旧 HTML 引用的 CSS
 * 哈希会在清理阶段先消失，刷新就会得到一张无样式页面。发布脚本只允许
 * 这个固定候选目录，构建完成后再停服并用同文件系统 rename 原子切换。
 */
const requestedDistDirectory = process.env.HUOQIU_NEXT_DIST_DIR;
if (
  requestedDistDirectory !== undefined &&
  requestedDistDirectory !== ".next-release"
) {
  throw new Error("HUOQIU_NEXT_DIST_DIR_INVALID");
}

const nextConfig: NextConfig = {
  distDir: requestedDistDirectory ?? ".next",
  transpilePackages: [
    "@huoqiu/contracts",
    "@huoqiu/design-tokens",
    "@huoqiu/web-ui",
  ],
  webpack: (configuration, { dev, nextRuntime, webpack }) => {
    if (!dev && nextRuntime === "edge") {
      configuration.devtool = "hidden-nosources-source-map";
      configuration.plugins.push(
        new webpack.DefinePlugin({
          "process.env.NEXT_PRIVATE_TEST_PROXY": JSON.stringify("false"),
        }),
      );
    }
    configuration.module.rules.push({
      include: /[\\/]packages[\\/]contracts[\\/]src[\\/]/u,
      resolve: {
        extensionAlias: {
          ".js": [".ts", ".tsx", ".js"],
        },
      },
    });
    return configuration;
  },
};

export default nextConfig;
