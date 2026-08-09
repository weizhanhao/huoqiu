import type { NextConfig } from "next";

import { assertZeroTrustStartupConfiguration } from "./src/zero-trust-configuration";

assertZeroTrustStartupConfiguration(process.env);

const nextConfig: NextConfig = {
  transpilePackages: ["@huoqiu/design-tokens", "@huoqiu/web-ui"],
};

export default nextConfig;
