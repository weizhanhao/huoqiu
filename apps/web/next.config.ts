import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

import { assertZeroTrustStartupConfiguration } from "./src/zero-trust-configuration";

assertZeroTrustStartupConfiguration(process.env);

export const M1_ROUTER_WEBPACK_SOURCE = fileURLToPath(
  new URL("../../packages/contracts/src/m1/router.ts", import.meta.url),
);

const nextConfig: NextConfig = {
  experimental: {
    extensionAlias: {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    },
  },
  transpilePackages: [
    "@huoqiu/contracts",
    "@huoqiu/design-tokens",
    "@huoqiu/web-ui",
  ],
  webpack: (configuration) => {
    // Next's Edge webpack cannot retain runtime exports from the package's
    // NodeNext TypeScript barrel. Keep the public import in application code
    // while resolving it to the same authoritative router source at build.
    configuration.resolve.alias = {
      ...configuration.resolve.alias,
      "@huoqiu/contracts/m1$": M1_ROUTER_WEBPACK_SOURCE,
    };
    return configuration;
  },
};

export default nextConfig;
