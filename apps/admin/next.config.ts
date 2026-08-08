import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/admin",
  basePath: "/admin",
  transpilePackages: ["@huoqiu/design-tokens", "@huoqiu/web-ui"],
};

export default nextConfig;
