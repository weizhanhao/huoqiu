import type { NextConfig } from "next";

import { assertZeroTrustStartupConfiguration } from "./src/zero-trust-configuration";

assertZeroTrustStartupConfiguration(process.env);

const nextConfig: NextConfig = {
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
